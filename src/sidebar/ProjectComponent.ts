import * as vscode from 'vscode'
import { TreeDataProvider, TreeItem } from 'vscode'
import { selectModule, selectModuleGlobal } from '../analysis/ModuleSelection'
import { Symbol } from '../analysis/Symbol'
import { ext } from '../extension'
import {
  CommandNode,
  EditorButton,
  TreeItemButton,
  ViewButton,
  ViewComponent,
} from '../lib/libconfig'
import { InstancesView, InstanceViewItem, ModuleItem } from './InstancesView'

export abstract class HierItem {
  getPath(): string {
    if (this.path !== undefined) {
      return this.path
    }
    return this.parent!.getPath() + '.' + this.instance.name
  }
  // the symbol to get children from
  instance: Symbol
  path: string | undefined
  parent: HierItem | undefined
  children: HierItem[] | undefined
  constructor(parent: HierItem | undefined, instance: Symbol) {
    this.parent = parent
    this.instance = instance
    if (parent === undefined) {
      this.path = this.instance.name
    }
  }
  async getChildren(): Promise<HierItem[]> {
    if (this.children === undefined) {
      this.children = await this._getChildren()
    }
    return this.children
  }

  async _getChildren(): Promise<HierItem[]> {
    return []
  }

  async getTreeItem(): Promise<TreeItem> {
    let item = new TreeItem(this.instance.name)
    if (this.instance.typeRef !== null) {
      item.label = item.label + ' : ' + this.instance.typeRef
    }
    item.iconPath = new vscode.ThemeIcon(this.instance.getIcon())
    return item
  }

  async preOrderTraversal(fn: (item: HierItem) => void) {
    fn(this)
    for (let child of await this.getChildren()) {
      await child.preOrderTraversal(fn)
    }
  }

  hasChildren(): boolean {
    return false
  }
}

const EXCLUDED_SYMS = new Set<string>(['enum', 'typedef', 'assert', 'function'])

abstract class ScopeItem extends HierItem {
  async getChildrenFromSymbol(sym: Symbol): Promise<HierItem[]> {
    if (sym.children.length === 0) {
      return []
    }
    const childSyms = sym.children
    const childItems = childSyms
      .filter((child) => !EXCLUDED_SYMS.has(child.type))
      // always blocks are not different from generate blocks here, so want to avoid them
      .filter((child) => !(child.type === 'block' && child.children.length === 0))
      .map(async (child) => {
        if (child.type === 'block') {
          return new InternalScopeItem(this, child)
        } else if (child.type === 'instance') {
          let def = await ext.index.findModuleSymbol(child.typeRef ?? '')
          return new InstanceItem(this, child, def)
        }
        let def = undefined
        if (child.typeRef !== undefined) {
          def = childSyms.find((sym) => sym.name === child.typeRef)
        }
        return LogicItem.fromSymbol(this, child)
      })
    return await Promise.all(childItems)
  }
}

export class InstanceItem extends ScopeItem {
  // Used by instances tree view as well
  definition: Symbol | undefined
  constructor(parent: HierItem | undefined, instance: Symbol, definition: Symbol | undefined) {
    super(parent, instance)
    this.definition = definition
  }
  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    item.contextValue = 'Module'
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }

  async _getChildren(): Promise<HierItem[]> {
    if (this.definition === undefined) {
      return []
    }
    return await this.getChildrenFromSymbol(this.definition)
  }

  hasChildren(): boolean {
    if (this.definition === undefined) {
      return false
    }
    return this.definition.children.filter((child) => !EXCLUDED_SYMS.has(child.type)).length > 0
  }
  async preOrderTraversal(fn: (item: HierItem) => void) {
    /// Guard against recursive modules
    fn(this)
    if (this.parent instanceof InstanceItem && this.definition === this.parent!.definition) {
      return
    }
    for (let child of await this.getChildren()) {
      await child.preOrderTraversal(fn)
    }
  }
}

class LogicItem extends HierItem {
  static PARAM_TYPES = new Set<string>(['parameter', 'constant'])
  static DATA_TYPES = new Set<string>(['port', 'net', 'register'])
  constructor(parent: HierItem | undefined, instance: Symbol) {
    super(parent, instance)
  }
  static fromSymbol(parent: HierItem | undefined, sym: Symbol): LogicItem {
    if (LogicItem.PARAM_TYPES.has(sym.type)) {
      return new ParamItem(parent, sym)
    } else if (LogicItem.DATA_TYPES.has(sym.type)) {
      return new DataItem(parent, sym)
    }
    return new LogicItem(parent, sym)
  }
}
class ParamItem extends LogicItem {}
class DataItem extends LogicItem {}

export class RootItem extends InstanceItem {
  constructor(instance: Symbol) {
    super(undefined, instance, instance)
  }
  preOrderTraversal = HierItem.prototype.preOrderTraversal
}

class InternalScopeItem extends ScopeItem {
  constructor(parent: HierItem | undefined, scope: Symbol) {
    super(parent, scope)
  }
  async _getChildren(): Promise<HierItem[]> {
    return this.getChildrenFromSymbol(this.instance)
  }
  async preOrderTraversal(fn: (item: HierItem) => void) {
    /// Guard against recursive modules
    fn(this)
    for (let child of await this.getChildren()) {
      if (child.instance !== this.parent!.instance) {
        await child.preOrderTraversal(fn)
      }
    }
  }
}
const STRUCTURE_SYMS = new Set<string>(['instance', 'block'])

class InstanceLink extends vscode.TerminalLink {
  path: string
  constructor(path: string, startIndex: number, length: number) {
    super(startIndex, length, 'Open in Hierarhcy View')
    this.path = path
  }
}

export class ProjectComponent
  extends ViewComponent
  implements TreeDataProvider<HierItem>, vscode.TerminalLinkProvider<InstanceLink>
{
  top: RootItem | undefined = undefined

  // Hierarchy Tree
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<HierItem> | undefined

  // Instances Index
  instancesView: InstancesView = new InstancesView()

  //////////////////////////////////////////////////////////////////
  // Editor Buttons
  //////////////////////////////////////////////////////////////////

  setTopLevel: EditorButton = new EditorButton(
    {
      title: 'Set Top Level',
      shortTitle: 'Set Top',
      languages: ['verilog', 'systemverilog'],
      icon: '$(chip)',
    },
    async (uri: vscode.Uri | undefined) => {
      if (uri === undefined) {
        vscode.window.showErrorMessage('Open a verilog document to select top')
        return
      }
      // should also be active text editor
      const doc = await vscode.workspace.openTextDocument(uri)
      const module = await selectModule(doc)
      if (module === undefined) {
        return
      }

      this.setTopModule(module)
    }
  )

  setInstanceByFile: EditorButton = new EditorButton(
    {
      title: 'Select Instance',
      icon: '$(symbol-class)',
      languages: ['verilog', 'systemverilog'],
    },
    async (openModule: vscode.Uri | undefined) => {
      if (openModule === undefined) {
        vscode.window.showErrorMessage('Open a verilog file to select instance')
        return
      }
      // get the module from the current file
      const doc = await vscode.workspace.openTextDocument(openModule)
      const moduleSym = await selectModule(doc)
      if (moduleSym === undefined) {
        return
      }
      // get the instances of the module
      let moduleItem: ModuleItem | undefined = undefined
      // These are sometimes different symbols instances
      for (const [key, value] of this.instancesView.modules.entries()) {
        if (key.name === moduleSym.name) {
          moduleItem = value
          break
        }
      }
      if (moduleItem === undefined) {
        return
      }
      await this.instancesView.treeView?.reveal(moduleItem, {
        select: true,
        focus: true,
        expand: true,
      })
      const instances: string[] = Array.from(moduleItem.instances.values()).map(
        (item: InstanceViewItem) => item.inst.getPath()
      )
      if (instances.length === 0) {
        vscode.window.showErrorMessage('No instances found in module')
        return
      }
      const path = await vscode.window.showQuickPick(instances, {
        title: 'Select Instance',
      })
      if (path === undefined) {
        return
      }
      // look upinstance that was selected
      const instance = moduleItem.instances.get(path)
      if (instance === undefined) {
        return
      }
      // reveal in sidebar, don't change file
      this.setInstance.func(instance.inst, {
        revealHierarchy: true,
        revealFile: false,
        revealInstance: true,
      })
    }
  )

  //////////////////////////////////////////////////////////////////
  // Hierarchy View Buttons
  //////////////////////////////////////////////////////////////////

  clearTopLevel: ViewButton = new ViewButton(
    {
      title: 'Clear Top Level',
      icon: '$(panel-close)',
    },
    async () => {
      this.top = undefined
      this._onDidChangeTreeData.fire()
    }
  )

  selectTopLevel: ViewButton = new ViewButton(
    {
      title: 'Select Top Level',
      icon: '$(folder-opened)',
    },
    async () => {
      const newtop = await selectModuleGlobal()
      if (newtop === undefined) {
        return
      }
      this.setTopModule(newtop)
    }
  )

  setInstanceByPathInternal: ViewButton = new ViewButton(
    {
      title: 'Set Instance',
      icon: '$(inspect)',
    },
    async (rootItem: RootItem | undefined, instPath: string | undefined) => {
      if (instPath === undefined) {
        instPath = await vscode.window.showInputBox({
          prompt: 'Enter instance path',
        })
        if (instPath === undefined) {
          return
        }
      }
      // instance is a string path, maybe containing brackets from elaboration, so strip those
      const regex = /\[\d+\]/g
      let cleaned = instPath.replace(regex, '')
      let parts = cleaned.split('.')

      // try to get top module from path if root not set
      const topStr = parts[0]
      if (rootItem === undefined && !(this.top?.instance.name === topStr)) {
        if (ext.index.moduleMap.has(topStr)) {
          const topUri = ext.index.moduleMap.get(topStr)
          if (topUri !== undefined) {
            const topDoc = await vscode.workspace.openTextDocument(topUri)
            const topModule = await selectModule(topDoc)
            if (topModule !== undefined) {
              this.setTopModule(topModule)
            }
          }
        }
      }
      // root Item is already top, no need to do anything with the value

      // have user select top if that didn't work
      if (this.top === undefined) {
        await this.selectTopLevel.func()
        if (this.top === undefined) {
          return
        }
      }

      // go through hierarchy
      let current: HierItem | undefined = undefined
      for (let part of parts) {
        let children: HierItem[]
        if (current === undefined) {
          children = await this.getChildren(current)
        } else {
          children = await current.getChildren()
        }
        let child: HierItem | undefined = children.find((child) => child.instance.name === part)
        if (child === undefined) {
          vscode.window.showErrorMessage(
            `Could not find instance ${part} in ${current?.instance.name ?? 'top level'}`
          )
          return
        }
        if (child instanceof LogicItem && !this.symFilter.has(child.instance.type)) {
          if (child instanceof ParamItem) {
            this.toggleParams.func()
          } else if (child instanceof DataItem) {
            this.toggleData.func()
          }
        }
        current = child
      }
      if (current === undefined) {
        return
      }
      this.setInstance.func(current)
    }
  )

  setInstanceByPath: CommandNode = new CommandNode(
    {
      title: 'Set Instance',
    },
    async (inst: string) => {
      this.setInstanceByPathInternal.func(undefined, inst)
    }
  )

  setInstance: CommandNode = new CommandNode(
    {
      title: 'Set Instance from Instance View',
      hidden: true,
    },
    async (
      instance: HierItem | undefined,
      {
        revealHierarchy,
        revealFile,
        revealInstance,
      }: { revealHierarchy?: boolean; revealFile?: boolean; revealInstance?: boolean } = {
        revealHierarchy: true,
        revealFile: true,
        revealInstance: true,
      }
    ) => {
      if (instance === undefined) {
        vscode.window.showErrorMessage('setInstance: Instance is undefined')
        return
      }
      if (revealHierarchy) {
        await this.treeView?.reveal(instance, { select: true, focus: true, expand: true })
      }
      const exposeSym = instance.instance
      if (revealFile) {
        vscode.window.showTextDocument(exposeSym.doc, {
          selection: exposeSym.getFullRange(),
        })
      }
      if (revealInstance) {
        // select the most recent module
        while (!(instance instanceof InstanceItem)) {
          instance = instance.parent
          if (instance === undefined) {
            return
          }
        }
        this.instancesView.revealPath(instance.definition!, instance.getPath())
      }
    }
  )

  //////////////////////////////////////////////////////////////////
  // Symbol Filtering
  //////////////////////////////////////////////////////////////////

  symFilter: Set<string> = new Set<string>(STRUCTURE_SYMS)
  // params / localparams (constants)
  includeParams: boolean = false
  // ports / nets / registers (variables)
  includePorts: boolean = false

  toggleParams: ViewButton = new ViewButton(
    {
      title: 'Toggle Params',
      icon: '$(symbol-type-parameter)',
    },
    async () => {
      this.includeParams = !this.includeParams
      if (this.includeParams) {
        for (let type of LogicItem.PARAM_TYPES) {
          this.symFilter.add(type)
        }
      } else {
        for (let type of LogicItem.PARAM_TYPES) {
          this.symFilter.delete(type)
        }
      }
      this._onDidChangeTreeData.fire()
    }
  )

  toggleData: ViewButton = new ViewButton(
    {
      title: 'Toggle Data',
      icon: '$(symbol-variable)',
    },
    async () => {
      this.includePorts = !this.includePorts
      if (this.includePorts) {
        for (let type of LogicItem.DATA_TYPES) {
          this.symFilter.add(type)
        }
      } else {
        for (let type of LogicItem.DATA_TYPES) {
          this.symFilter.delete(type)
        }
      }
      this._onDidChangeTreeData.fire()
    }
  )

  //////////////////////////////////////////////////////////////////
  // Inline Item Buttons
  //////////////////////////////////////////////////////////////////

  showSourceFile: TreeItemButton = new TreeItemButton(
    {
      title: 'Show Module',
      inlineContext: ['Module'],
      icon: {
        light: './resources/light/go-to-file.svg',
        dark: './resources/dark/go-to-file.svg',
      },
    },
    async (item: HierItem) => {
      if (item instanceof InstanceItem && item.definition) {
        vscode.window.showTextDocument(item.definition.doc, {
          selection: item.definition.getIdRange(),
        })
      }
    }
  )

  copyHierarchyPath: TreeItemButton = new TreeItemButton(
    {
      title: 'Copy Path',
      inlineContext: [],
      icon: {
        light: './resources/light/files.svg',
        dark: './resources/dark/files.svg',
      },
    },
    async (item: HierItem) => {
      vscode.env.clipboard.writeText(item.getPath())
    }
  )

  constructor() {
    super({
      name: 'Hierarchy',
      welcome: {
        contents: '[Select top level](command:verilog.project.selectTopLevel)',
      },
    })
  }

  static RE_INSTANCE_PATHS = /[\w$]+(\[\d+\])?(\.[\w$]+(\[\d+\])?)+/g

  provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<InstanceLink[]> {
    let links = []
    for (let match of context.line.matchAll(ProjectComponent.RE_INSTANCE_PATHS)) {
      const line = context.line
      const startIndex = line.indexOf(match[0])
      const path = match[0]
      const topModule = path.split('.')[0]
      if (this.top?.instance.name === topModule || ext.index.moduleMap.has(topModule)) {
        links.push(new InstanceLink(path, startIndex, path.length))
      }
    }
    return links
  }
  handleTerminalLink(link: InstanceLink): vscode.ProviderResult<void> {
    this.setInstanceByPathInternal.func(undefined, link.path)
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.treeView = vscode.window.createTreeView(this.configPath!, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: undefined,
      manageCheckboxStateManually: false,
    })
    // If you actually register it, you don't get the collapsible state button :/ Thanks Microsoft
    // context.subscriptions.push(vscode.window.registerTreeDataProvider(this.configPath!, this))

    context.subscriptions.push(vscode.window.registerTerminalLinkProvider(this))
  }

  async setTopModule(top: Symbol) {
    this.top = new RootItem(top)
    if (this.top !== undefined && this.treeView !== undefined) {
      this.treeView.reveal(this.top, { select: true, focus: true })
      this._onDidChangeTreeData.fire()
    }
    await this.instancesView.indexTop(this.top)
  }

  async getTreeItem(element: HierItem): Promise<TreeItem> {
    const [treeItem, children] = await Promise.all([
      element.getTreeItem(),
      this.getChildren(element),
    ])
    if (children.length === 0) {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.None
    } else if (element instanceof RootItem) {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    } else {
      treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }
    return treeItem
  }

  async getChildren(element?: HierItem | undefined): Promise<HierItem[]> {
    if (element === undefined) {
      if (this.top === undefined) {
        return []
      }
      return [this.top]
    }
    const children = await element.getChildren()
    return children.filter((child) => this.symFilter.has(child.instance.type))
  }

  getParent(element: HierItem): HierItem | undefined {
    return element.parent
  }

  async resolveTreeItem(
    item: TreeItem,
    element: HierItem,
    _token: vscode.CancellationToken
  ): Promise<TreeItem> {
    /// Triggered on hover
    item.tooltip = element.instance.getHoverText()
    item.command = {
      title: 'Go to definition',
      command: 'verilog.project.setInstance',
      arguments: [element, { revealHierarchy: false, revealFile: true, revealInstance: true }],
    }

    return item
  }
}

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
import { InstancesView, InstanceViewItem } from './InstancesView'

export abstract class HierItem {
  getPath(): string {
    if (this.path !== undefined) {
      return this.path
    }
    return this.parent!.getPath() + '.' + this.instance.name
  }
  // the symbol to get children from
  instance: Symbol
  parent: HierItem | undefined
  path: string | undefined
  constructor(parent: HierItem | undefined, instance: Symbol) {
    this.parent = parent
    this.instance = instance
    if (parent === undefined) {
      this.path = this.instance.name
    }
  }
  async getChildren(): Promise<HierItem[]> {
    return []
  }

  async getTreeItem(): Promise<TreeItem> {
    let item = new TreeItem(this.instance.name)
    if (this.hasChildren()) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }
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
        return new LogicItem(this, child)
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

  async getChildren(): Promise<HierItem[]> {
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
}

class LogicItem extends HierItem {
  constructor(parent: HierItem | undefined, instance: Symbol) {
    super(parent, instance)
  }
}

export class RootItem extends InstanceItem {
  constructor(instance: Symbol) {
    super(undefined, instance, instance)
  }

  async getTreeItem(): Promise<TreeItem> {
    const treeItem = await super.getTreeItem()
    treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    return treeItem
  }
}

class InternalScopeItem extends ScopeItem {
  constructor(parent: HierItem | undefined, scope: Symbol) {
    super(parent, scope)
  }
  getChildren(): Promise<HierItem[]> {
    return this.getChildrenFromSymbol(this.instance)
  }
}
const STRUCTURE_SYMS = new Set<string>(['instance', 'block'])

export class ProjectComponent extends ViewComponent implements TreeDataProvider<HierItem> {
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
      title: 'Select Instance of Module',
      icon: '$(symbol-class)',
      languages: ['verilog', 'systemverilog'],
    },
    async (openModule: vscode.Uri | undefined) => {
      if (openModule === undefined) {
        vscode.window.showErrorMessage('Open a verilog file to select instance')
        return
      } // let the user select the instance based on module
      const doc = await vscode.workspace.openTextDocument(openModule)
      const moduleSym = await selectModule(doc)
      if (moduleSym === undefined) {
        return
      }
      // vscode show quickpick
      const moduleItem = this.instancesView.modules.get(moduleSym)
      if (moduleItem === undefined) {
        return
      }
      const instances: string[] = Array.from(moduleItem.instances.values()).map(
        (item: InstanceViewItem) => item.inst.getPath()
      )
      const path = await vscode.window.showQuickPick(instances)
      if (path === undefined) {
        return
      }
      // get instance that was selected
      const instance = moduleItem.instances.get(path)
      if (instance === undefined) {
        return
      }
      this.setInstance.func(instance.inst, { revealHierarchy: true, revealFile: false })
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

  setInstanceByPath: ViewButton = new ViewButton(
    {
      title: 'Set Instance By Path',
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
      if (rootItem === undefined) {
        const topStr = parts[0]
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
        let children = await this.getChildren(current)
        let child = children.find((child) => child.instance.name === part)
        if (child === undefined) {
          vscode.window.showErrorMessage(
            `Could not find instance ${part} in ${current?.instance.name ?? 'top level'}`
          )
          return
        }
        current = child
      }
      if (current === undefined) {
        return
      }
      this.setInstance.func(current)
    }
  )
  setInstance: CommandNode = new CommandNode(
    {
      title: 'Set Instance',
    },
    async (
      instance: HierItem | undefined,
      { revealHierarchy, revealFile }: { revealHierarchy?: boolean; revealFile?: boolean } = {
        revealHierarchy: true,
        revealFile: true,
      }
    ) => {
      if (instance === undefined) {
        vscode.window.showErrorMessage('setInstance: Instance is undefined')
        return
      }
      if (revealHierarchy) {
        this.treeView?.reveal(instance, { select: true, focus: true, expand: true })
        this._onDidChangeTreeData.fire()
      }
      const exposeSym = instance.instance
      if (revealFile && exposeSym.doc !== vscode.window.activeTextEditor?.document) {
        vscode.window.showTextDocument(exposeSym.doc, {
          selection: exposeSym.getFullRange(),
        })
      }
      // select the most recent module
      while (!(instance instanceof InstanceItem)) {
        instance = instance.parent
        if (instance === undefined) {
          return
        }
      }
      this.instancesView.revealPath(instance.definition!, instance.getPath())
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
        this.symFilter.add('parameter')
        this.symFilter.add('constant')
      } else {
        this.symFilter.delete('parameter')
        this.symFilter.delete('constant')
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
        this.symFilter.add('port')
        this.symFilter.add('net')
        this.symFilter.add('register')
      } else {
        this.symFilter.delete('port')
        this.symFilter.delete('net')
        this.symFilter.delete('register')
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

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.treeView = vscode.window.createTreeView(this.configPath!, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: undefined,
      manageCheckboxStateManually: false,
    })
    context.subscriptions.push(this.treeView)
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
      arguments: [element, { revealHierarchy: false, revealFile: true }],
    }

    return item
  }
}

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
import { DefaultMap } from '../utils'

class ScopeItem {
  getPath(): string {
    if (this.path !== undefined) {
      return this.path
    }
    return this.parent!.getPath() + '.' + this.instance.name
  }
  // the symbol to get children from
  definition: Symbol | undefined
  instance: Symbol
  parent: ScopeItem | undefined
  path: string | undefined
  constructor(parent: ScopeItem | undefined, instance: Symbol, definition: Symbol | undefined) {
    this.parent = parent
    this.instance = instance
    this.definition = definition
    if (parent === undefined) {
      this.path = this.instance.name
    }
  }
  async getChildren(): Promise<ScopeItem[]> {
    return []
  }

  hasChildren(): boolean {
    if (this.definition === undefined) {
      return false
    }
    return this.definition.children.filter((child) => !EXCLUDED_SYMS.has(child.type)).length > 0
  }

  getIcon(): string {
    return this.instance.getIcon()
  }

  async getTreeItem(): Promise<TreeItem> {
    let item = new TreeItem(this.instance.name)
    if (this.hasChildren()) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }
    if (this.instance.typeRef !== null) {
      item.label = item.label + ' : ' + this.instance.typeRef
    }
    item.iconPath = new vscode.ThemeIcon(this.getIcon())
    return item
  }

  async preOrderTraversal(fn: (item: ScopeItem) => void) {
    fn(this)
    for (let child of await this.getChildren()) {
      await child.preOrderTraversal(fn)
    }
  }
}

const EXCLUDED_SYMS = new Set<string>(['enum', 'typedef', 'assert', 'function'])

export class InstanceItem extends ScopeItem {
  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    if (this.definition !== undefined) {
      item.contextValue = 'Module'
    }
    return item
  }

  async getChildren(): Promise<ScopeItem[]> {
    if (this.definition === undefined) {
      return []
    }
    if (this.definition.children.length === 0) {
      return []
    }
    const childSyms = this.definition.children
    const childItems = childSyms
      .filter((child) => !EXCLUDED_SYMS.has(child.type))
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

  getIcon(): string {
    return 'chip'
  }
}

class LogicItem extends ScopeItem {
  constructor(parent: ScopeItem | undefined, instance: Symbol) {
    super(parent, instance, instance)
  }
}

class RootItem extends InstanceItem {
  constructor(instance: Symbol) {
    super(undefined, instance, instance)
  }

  async getTreeItem(): Promise<TreeItem> {
    const treeItem = await super.getTreeItem()
    treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    return treeItem
  }
}

class InternalScopeItem extends InstanceItem {
  constructor(parent: ScopeItem | undefined, scope: Symbol) {
    super(parent, scope, scope)
  }
  getIcon(): string {
    return 'bracket'
  }
}
const STRUCTURE_SYMS = new Set<string>(['instance', 'block'])

export class ProjectComponent extends ViewComponent implements TreeDataProvider<ScopeItem> {
  top: RootItem | undefined = undefined

  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<ScopeItem> | undefined
  instancesByModule: DefaultMap<Symbol, InstanceItem[]> = new DefaultMap(() => [])

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
      const module = await selectModule(doc)
      if (module === undefined) {
        return
      }
      // vscode show quickpick
      const path = await vscode.window.showQuickPick(
        this.instancesByModule.get(module).map((item) => item.getPath())
      )
      if (path === undefined) {
        return
      }
      // get instance that was selected
      const instance = this.instancesByModule.get(module).find((item) => item.getPath() === path)
      if (instance === undefined) {
        return
      }
      this.setInstance.func(instance)
    }
  )

  setInstanceByPath: ViewButton = new ViewButton(
    {
      title: 'Set Instance By Path',
      icon: '$(inspect)',
    },
    async (rootItem: RootItem | undefined, instPath: string | undefined) => {
      console.log('setInstanceByPath', rootItem, instPath)
      if (instPath === undefined) {
        instPath = await vscode.window.showInputBox({
          prompt: 'Enter instance path',
        })
        if (instPath === undefined) {
          return
        }
      }
      // TODO: try to get top module from path
      if (this.top === undefined) {
        await this.selectTopLevel.func()
        if (this.top === undefined) {
          return
        }
      }

      if (typeof instPath !== 'string') {
        vscode.window.showErrorMessage('setInstanceByPath: Path is not a string')
        return
      }

      // instance is a string path, maybe containing brackets from elaboration
      // strip brackets, go through hierarchy
      const regex = /\[\d+\]/g
      let cleaned = instPath.replace(regex, '')
      let parts = cleaned.split('.')
      let current: ScopeItem | undefined = undefined
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
    async (instance: ScopeItem | undefined) => {
      if (instance === undefined) {
        vscode.window.showErrorMessage('setInstance: Instance is undefined')
        return
      }
      this.treeView?.reveal(instance, { select: true, focus: true, expand: true })
      const exposeSym = instance.instance
      if (exposeSym.doc !== vscode.window.activeTextEditor?.document) {
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
      ext.instSelect.revealPath(instance.definition!, instance.getPath())
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
    async (item: ScopeItem) => {
      if (item.definition) {
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
    async (item: ScopeItem) => {
      vscode.env.clipboard.writeText(item.getPath())
    }
  )
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

  root: RootItem | undefined = undefined

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

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Hierarchy',
        cancellable: false,
      },

      async (progress) => {
        progress.report({ increment: 0, message: 'Starting...' })

        await this.top?.preOrderTraversal((item: ScopeItem) => {
          if (item.definition !== undefined) {
            if (item.definition !== undefined && item.definition.type === 'module') {
              this.instancesByModule.get(item.definition).push(item as InstanceItem)
            }
          }
          progress.report({ increment: 1 })
        })

        progress.report({ increment: 100, message: 'Done' })
        ext.instSelect.onIndexComplete()
      }
    )
  }

  async getTreeItem(element: ScopeItem): Promise<TreeItem> {
    return element.getTreeItem()
  }

  async getChildren(element?: ScopeItem | undefined): Promise<ScopeItem[]> {
    if (element === undefined) {
      if (this.top === undefined) {
        return []
      }
      return [this.top]
    }
    const children = await element.getChildren()
    return children.filter((child) => this.symFilter.has(child.instance.type))
  }

  getParent(element: ScopeItem): ScopeItem | undefined {
    return element.parent
  }

  async resolveTreeItem(
    item: TreeItem,
    element: ScopeItem,
    _token: vscode.CancellationToken
  ): Promise<TreeItem> {
    /// Triggered on hover
    item.tooltip = element.instance.getHoverText()
    item.command = {
      title: 'Go to definition',
      command: 'vscode.open',
      arguments: [element.instance.doc.uri, { selection: element.instance.getFullRange() }],
    }

    return item
  }
}

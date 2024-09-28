import * as vscode from 'vscode'
import { TreeDataProvider, TreeItem } from 'vscode'
import { selectModule, selectModuleGlobal } from '../analysis/ModuleSelection'
import { Symbol } from '../analysis/Symbol'
import { ext } from '../extension'
import { EditorButton, TreeItemButton, ViewButton, ViewComponent } from '../lib/libconfig'
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

  async preOrderTraversal<T extends ScopeItem>(fn: (item: T) => void) {
    if (this.isInstanceOf<T>()) {
      fn(this as T)
    }
    for (let child of await this.getChildren()) {
      await child.preOrderTraversal<T>(fn)
    }
  }

  private isInstanceOf<T extends ScopeItem>(): this is T {
    // You might need to adjust this condition based on your specific requirements
    return true
  }
}

const EXCLUDED_SYMS = new Set<string>(['enum', 'typedef', 'assert', 'function'])

const STRUCTURE_SYMS = new Set<string>(['instance', 'block'])
const LOGIC_SYMS = new Set<string>(['port', 'register'])
const PARAM_SYMS = new Set<string>(['parameter', 'constant'])

class ModuleItem extends ScopeItem {
  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    if (this.definition !== undefined) {
      item.contextValue = 'File'
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
          return new ModuleItem(this, child, def)
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

class RootItem extends ModuleItem {
  constructor(instance: Symbol) {
    super(undefined, instance, instance)
  }

  async getTreeItem(): Promise<TreeItem> {
    const treeItem = await super.getTreeItem()
    treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    return treeItem
  }
}

class InternalScopeItem extends ModuleItem {
  constructor(parent: ScopeItem | undefined, scope: Symbol) {
    super(parent, scope, scope)
  }
  getIcon(): string {
    return 'bracket'
  }
}

export class ProjectComponent extends ViewComponent implements TreeDataProvider<ScopeItem> {
  top: RootItem | undefined = undefined

  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<ScopeItem> | undefined
  instancesByModule: DefaultMap<Symbol, ModuleItem[]> = new DefaultMap(() => [])

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

  setInstance: EditorButton = new EditorButton(
    {
      title: 'Set Instance',
      icon: '$(symbol-class)',
      languages: ['verilog', 'systemverilog'],
    },
    async (instance: string | vscode.Uri) => {
      if (this.top === undefined) {
        await this.selectTopLevel.func()
      }

      if (this.top === undefined) {
        return
      }

      if (instance instanceof vscode.Uri) {
        // TODO: list instances for the user to select, editor button
        const doc = await vscode.workspace.openTextDocument(instance)
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
        instance = path
      }
      console.log(`setting instance to ${instance}`)

      // strip brackets, go through hierarchy
      const regex = /\[\d+\]/g
      let cleaned = instance.replace(regex, '')
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
      this.treeView?.reveal(current, { select: true, focus: true, expand: true })
      const exposeSym = current.definition ?? current.instance
      vscode.window.showTextDocument(current.definition!.doc, {
        selection: exposeSym.getFullRange(),
      })
    }
  )

  //////////////////////////////////////////////////////////////////
  // Inline Item Buttons
  //////////////////////////////////////////////////////////////////

  showSourceFile: TreeItemButton = new TreeItemButton(
    {
      title: 'Show Module',
      inlineContext: ['File'],
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
  root: RootItem | undefined = undefined

  constructor() {
    super({
      name: 'Project',
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
        console.log('starting indexing')
        progress.report({ increment: 0, message: 'Starting...' })

        // Simplify indexing
        await this.top?.preOrderTraversal<ModuleItem>((item: ModuleItem) => {
          if (item.definition !== undefined) {
            this.instancesByModule.get(item.definition).push(item)
          }
          progress.report({ increment: 1, message: `Indexing ${item.instance.name}...` })
        })

        progress.report({ increment: 100, message: 'Done' })
        console.log('indexing done')
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
    return await element.getChildren()
  }

  getParent(element: ScopeItem): ScopeItem | undefined {
    return element.parent
  }

  async resolveTreeItem(
    item: TreeItem,
    element: ScopeItem,
    _token: vscode.CancellationToken
  ): Promise<TreeItem> {
    item.tooltip = element.instance.getHoverText()
    item.command = {
      title: 'Go to definition',
      command: 'vscode.open',
      arguments: [element.instance.doc.uri, { selection: element.instance.getFullRange() }],
    }

    return item
  }
}

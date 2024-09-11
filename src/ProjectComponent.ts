import * as vscode from 'vscode'
import { TreeDataProvider, TreeItem } from 'vscode'
import { selectModule, selectModuleGlobal } from './analysis/ModuleSelection'
import { Symbol } from './analysis/Symbol'
import { ext } from './extension'
import { CommandNode, ViewComponent } from './lib/libconfig'

class ScopeItem {
  // the symbol to get children from
  definition: Symbol | undefined
  instance: Symbol
  constructor(instance: Symbol, definition: Symbol | undefined) {
    this.instance = instance
    this.definition = definition
  }
  async getChildren(): Promise<ScopeItem[]> {
    if (this.definition === undefined) {
      // vscode.window.showErrorMessage("Can't find definition")
      return []
    }
    if (this.definition.children.length === 0) {
      // vscode.window.showErrorMessage('children len 0')
      return []
    }
    let childSyms = this.definition.children
      .filter((child) => child.type === 'instance' || child.type === 'block')
      .map(async (child) => {
        if (child.type === 'block') {
          return new InternalScopeItem(child)
        }
        let def = await ext.ctags.findModuleSymbol(child.typeRef ?? '')
        return new ModuleItem(child, def)
      })
    let ret = await Promise.all(childSyms)
    return ret
  }

  hasChildren(): boolean {
    if (this.definition === undefined) {
      return false
    }
    return this.definition.hasInstanceChildren()
  }

  async getTreeItem(): Promise<TreeItem> {
    let item = new TreeItem(this.instance.name)
    if (this.hasChildren()) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
    }
    return item
  }
}

class ModuleItem extends ScopeItem {
  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    // item.label = item.label + ': ' + this.instance.typeRef
    item.label = this.instance.typeRef + ' ' + item.label
    item.contextValue = 'File'
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }
}

class RootItem extends ModuleItem {
  constructor(instance: Symbol) {
    super(instance, instance)
  }

  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = new TreeItem(this.instance.name, vscode.TreeItemCollapsibleState.Expanded)
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }
}

class InternalScopeItem extends ScopeItem {
  constructor(scope: Symbol) {
    super(scope, scope)
  }
  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    item.iconPath = new vscode.ThemeIcon('bracket')
    return item
  }
}

export class ProjectComponent extends ViewComponent implements TreeDataProvider<ScopeItem> {
  top: Symbol | undefined = undefined

  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<ScopeItem> | undefined

  setTopLevel: CommandNode = new CommandNode(
    {
      title: 'Verilog: Set Top Level',
      shortTitle: 'Set Top',
      languages: ['verilog', 'systemverilog'],
      isTitleButton: true,
      icon: '$(chip)',
    },
    async () => {
      let doc = vscode.window.activeTextEditor?.document
      if (doc === undefined) {
        vscode.window.showErrorMessage('Open a verilog document to select top')
        return
      }
      this.top = await selectModule(doc)
      this._onDidChangeTreeData.fire()
      // show view
      if (this.top !== undefined && this.treeView !== undefined) {
        // this.treeView.reveal(new RootItem(), { select: true, focus: true })
        this.treeView.reveal(new RootItem(this.top), { select: true, focus: true })
      }
    }
  )

  clearTopLevel: CommandNode = new CommandNode(
    {
      title: 'Verilog: Clear Top Level',
      icon: '$(panel-close)',
      isTitleButton: true,
    },
    async () => {
      this.top = undefined
      this._onDidChangeTreeData.fire()
    }
  )

  selectTopLevel: CommandNode = new CommandNode(
    {
      title: 'Verilog: Select Top Level',
      icon: '$(folder-opened)',
      isTitleButton: true,
    },
    async () => {
      this.top = await selectModuleGlobal()
      this._onDidChangeTreeData.fire()
    }
  )

  showSourceFile: CommandNode = new CommandNode(
    {
      title: 'Show Module',
      inlineContext: 'File',
    },
    async (item: ScopeItem) => {
      if (item.definition) {
        vscode.window.showTextDocument(item.definition.doc)
      }
    }
  )

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

  async getTreeItem(element: ScopeItem): Promise<TreeItem> {
    return element.getTreeItem()
  }

  async getChildren(element?: ScopeItem | undefined): Promise<ScopeItem[]> {
    if (element === undefined) {
      if (this.top === undefined) {
        return []
      }
      return [new RootItem(this.top)]
    }
    return await element.getChildren()
  }

  getParent(): ScopeItem | undefined {
    // we want to be able to reveal the root item
    return undefined
  }

  async resolveTreeItem(
    item: TreeItem,
    element: ScopeItem,
    _token: vscode.CancellationToken
  ): Promise<TreeItem> {
    // throw new Error('Method not implemented.')
    item.tooltip = element.instance.getHoverText()
    item.command = {
      title: 'Go to definition',
      command: 'vscode.open',
      arguments: [element.instance.doc.uri, { selection: element.instance.getFullRange() }],
    }

    return item
  }
}

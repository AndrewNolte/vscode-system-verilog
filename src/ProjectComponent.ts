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
  parent: ScopeItem | undefined
  constructor(parent: ScopeItem | undefined, instance: Symbol, definition: Symbol | undefined) {
    this.parent = parent
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
    const childSyms = this.definition.children

    // .filter((child) => child.type === 'instance' || child.type === 'block')
    const childItems = childSyms.map(async (child) => {
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
    let ret = await Promise.all(childItems)
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
    item.label = item.label + ': ' + this.instance.typeRef
    item.contextValue = 'File'
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }
}

class LogicItem extends ScopeItem {
  constructor(parent: ScopeItem | undefined, instance: Symbol) {
    super(parent, instance, instance)
  }

  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    item.iconPath = new vscode.ThemeIcon(this.instance.getIcon())
    item.label = item.label
    if (this.instance.typeRef !== null) {
      item.label = item.label + ': ' + this.instance.typeRef
    } else {
      item.label = item.label + ': ' + this.instance.type
    }
    return item
  }
}

class RootItem extends ModuleItem {
  constructor(instance: Symbol) {
    super(undefined, instance, instance)
  }

  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = new TreeItem(this.instance.name, vscode.TreeItemCollapsibleState.Expanded)
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }
}

class InternalScopeItem extends ScopeItem {
  constructor(parent: ScopeItem | undefined, scope: Symbol) {
    super(parent, scope, scope)
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
      title: 'Set Top Level',
      shortTitle: 'Set Top',
      languages: ['verilog', 'systemverilog'],
      isTitleButton: false,
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
      title: 'Clear Top Level',
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
      title: 'Select Top Level',
      icon: '$(folder-opened)',
      isTitleButton: true,
    },
    async () => {
      const newtop = await selectModuleGlobal()
      if (newtop !== undefined) {
        this.top = newtop
        this._onDidChangeTreeData.fire()
      }
    }
  )

  setInstance: CommandNode = new CommandNode(
    {
      title: 'Set Instance',
      icon: '$(symbol-class)',
      isTitleButton: false,
      languages: ['verilog', 'systemverilog'],
    },
    async (instance: string | vscode.Uri) => {
      if (this.top === undefined) {
        this.selectTopLevel.func()
      }

      if (this.top === undefined) {
        return
      }

      if (instance instanceof vscode.Uri) {
        // TODO: list instances
        return
      }

      // strip brackets, go through hierarchy

      const regex = /\[\d+\]/g
      // remove all brackets with numbers
      let cleaned = instance.replace(regex, '')
      // split on .
      let parts = cleaned.split('.')
      console.log(parts)
      let current: ScopeItem = (await this.getChildren(undefined))[0]
      for (let part of parts) {
        let children = await this.getChildren(current)
        let child = children.find((child) => child.instance.name === part)
        if (child === undefined) {
          vscode.window.showErrorMessage(
            `Could not find instance ${part} in ${current?.instance.name}`
          )
          return
        }
        current = child
      }
      this.treeView?.reveal(current, { select: true, focus: true })
      vscode.window.showTextDocument(current.instance.doc, {
        selection: current.instance.getFullRange(),
      })
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

  getParent(element: ScopeItem): ScopeItem | undefined {
    return element.parent
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

import * as vscode from 'vscode'
import { Symbol } from '../analysis/Symbol'
import { ViewComponent } from '../lib/libconfig'
import { DefaultMap } from '../utils'
import { HierItem, InstanceItem, RootItem } from './HierarchyView'

export class InstanceViewItem {
  parent: ModuleItem
  inst: InstanceItem
  constructor(parent: ModuleItem, inst: InstanceItem) {
    this.parent = parent
    this.inst = inst
  }
  getParent(): ModuleItem {
    return this.parent
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.inst.getPath(), vscode.TreeItemCollapsibleState.None)
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }

  resolveTreeItem(item: vscode.TreeItem, _token: vscode.CancellationToken): vscode.TreeItem {
    item.tooltip = this.inst.getPath()
    item.command = {
      title: 'Open Instance',
      command: 'verilog.project.setInstance',
      arguments: [this.inst, { revealInstance: false, revealFile: true, revealHierarchy: true }],
    }
    return item
  }

  getChildren(): InstanceTreeItem[] {
    return []
  }
}

export class ModuleItem {
  definition: Symbol
  instances: Map<string, InstanceViewItem> = new Map()

  constructor(definition: Symbol) {
    this.definition = definition
  }

  addInstance(item: InstanceItem) {
    this.instances.set(item.getPath(), new InstanceViewItem(this, item))
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      this.definition.name,
      vscode.TreeItemCollapsibleState.Collapsed
    )
    item.iconPath = new vscode.ThemeIcon('file')
    if (this.instances.size === 1) {
      item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded
    }
    return item
  }

  resolveTreeItem(item: vscode.TreeItem, _token: vscode.CancellationToken): vscode.TreeItem {
    item.tooltip = this.definition.name
    item.command = {
      title: 'Open Module',
      command: 'vscode.open',
      arguments: [this.definition.doc.uri, { selection: this.definition.getIdRange() }],
    }
    return item
  }

  getChildren(): InstanceTreeItem[] {
    return Array.from(this.instances.values()).map((item) => {
      return item
    })
  }
}

type InstanceTreeItem = InstanceViewItem | ModuleItem
export class InstancesView
  extends ViewComponent
  implements vscode.TreeDataProvider<InstanceTreeItem>
{
  modules: DefaultMap<Symbol, ModuleItem> = new DefaultMap((sym: Symbol) => new ModuleItem(sym))
  async indexTop(top: RootItem) {
    this.modules.clear()
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Hierarchy',
        cancellable: false,
      },

      async (progress) => {
        progress.report({ increment: 0, message: 'Starting...' })

        await top.preOrderTraversal((item: HierItem) => {
          if (item instanceof InstanceItem && item.definition) {
            this.modules.get(item.definition).addInstance(item)
          }
          progress.report({ increment: 1 })
        })

        progress.report({ increment: 100, message: 'Done' })
      }
    )
    this._onDidChangeTreeData.fire()
  }
  revealPath(module: Symbol, path: string) {
    const moduleItem = this.modules.get(module)
    if (moduleItem === undefined) {
      return
    }
    const inst = moduleItem.instances.get(path)
    if (inst) {
      this.treeView?.reveal(inst, { select: true, focus: true, expand: true })
    }
  }
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<InstanceTreeItem> | undefined

  constructor() {
    super({
      name: 'Instances',
      welcome: {
        contents: '[Select top level](command:verilog.project.selectTopLevel)',
      },
    })
  }

  async activate(context: vscode.ExtensionContext) {
    this.treeView = vscode.window.createTreeView(this.configPath!, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: undefined,
      manageCheckboxStateManually: false,
    })
    context.subscriptions.push(this.treeView)
  }

  getTreeItem(element: InstanceTreeItem): vscode.TreeItem {
    return element.getTreeItem()
  }

  getChildren(element?: undefined | InstanceTreeItem): vscode.ProviderResult<InstanceTreeItem[]> {
    if (element === undefined) {
      return Array.from(this.modules.values())
    }
    return element.getChildren()
  }

  getParent(element: InstanceTreeItem): vscode.ProviderResult<InstanceTreeItem> {
    if (element instanceof ModuleItem) {
      return undefined
    }
    return element.parent
  }

  async resolveTreeItem(
    item: vscode.TreeItem,
    element: InstanceTreeItem,
    _token: vscode.CancellationToken
  ): Promise<vscode.TreeItem> {
    return element.resolveTreeItem(item, _token)
  }
}

import * as vscode from 'vscode'
import { Symbol } from '../analysis/Symbol'
import { ext } from '../extension'
import { ViewComponent } from '../lib/libconfig'
import { DefaultMap } from '../utils'
import { InstanceItem } from './ProjectComponent'

class InstanceViewItem {
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
    if (this.inst.definition) {
      item.command = {
        title: 'Open Instance',
        command: 'verilog.project.setInstance',
        arguments: [this.inst],
      }
    }
    return item
  }

  getChildren(): InstanceTreeItem[] {
    return []
  }
}

class ModuleItem {
  definition: Symbol
  constructor(definition: Symbol) {
    this.definition = definition
  }
  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(
      this.definition.name,
      vscode.TreeItemCollapsibleState.Collapsed
    )
    item.iconPath = new vscode.ThemeIcon('file')
    const instances = ext.project.instancesByModule.get(this.definition) || []
    if (instances.length === 1) {
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
    const instances = ext.project.instancesByModule.get(this.definition) || []
    return instances.map((item) => {
      const instanceViewItem = new InstanceViewItem(this, item)
      ext.instSelect.modulesToInstances.get(this.definition)?.set(item.getPath(), instanceViewItem)
      return instanceViewItem
    })
  }
}

type InstanceTreeItem = InstanceViewItem | ModuleItem
export class InstanceView
  extends ViewComponent
  implements vscode.TreeDataProvider<InstanceTreeItem>
{
  onIndexComplete() {
    this._onDidChangeTreeData.fire()
  }
  revealPath(module: Symbol, path: string) {
    const inst = this.modulesToInstances.get(module).get(path)
    if (inst) {
      this.treeView?.reveal(inst, { select: true, focus: true, expand: true })
    }
    this._onDidChangeTreeData.fire()
  }
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<InstanceTreeItem> | undefined

  modulesToInstances: DefaultMap<Symbol, Map<string, InstanceViewItem>> = new DefaultMap(
    () => new Map<string, InstanceViewItem>()
  )

  constructor() {
    super({
      name: 'Instances',
      welcome: {
        contents: '[Select instance](command:verilog.project.setInstance)',
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
      return Array.from(ext.project.instancesByModule.keys()).map((item) => {
        return new ModuleItem(item)
      })
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

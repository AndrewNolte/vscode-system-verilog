import * as vscode from 'vscode'
import { ext } from '../extension'
import { ViewComponent } from '../lib/libconfig'
import { ModuleItem } from './ProjectComponent'

class InstanceItem {
  path: string
  constructor(path: string) {
    this.path = path
  }
}

export class InstanceView extends ViewComponent implements vscode.TreeDataProvider<InstanceItem> {
  revealPath(module: ModuleItem, path: string) {
    this.module = module
    this.treeView?.reveal(new InstanceItem(path), { select: true, focus: true, expand: true })
    this._onDidChangeTreeData.fire()
  }
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<InstanceItem> | undefined

  module: ModuleItem | undefined

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

  getTreeItem(element: InstanceItem): vscode.TreeItem {
    const item = new vscode.TreeItem(element.path, vscode.TreeItemCollapsibleState.None)
    item.iconPath = new vscode.ThemeIcon('symbol-instance')
    return item
  }

  getChildren(element?: InstanceItem | undefined): vscode.ProviderResult<InstanceItem[]> {
    if (element !== undefined) {
      // TODO: show different parameterizations as children
      return []
    }
    if (this.module === undefined) {
      return []
    }
    if (this.module.definition === undefined) {
      return []
    }
    console.log('returning instances')
    console.log(ext.project.instancesByModule.get(this.module.definition))
    return ext.project.instancesByModule.get(this.module.definition).map((item) => {
      return new InstanceItem(item.getPath())
    })
  }

  getParent(_element: InstanceItem): vscode.ProviderResult<InstanceItem> {
    // flat structure
    return undefined
  }

  async resolveTreeItem(
    item: vscode.TreeItem,
    element: InstanceItem,
    _token: vscode.CancellationToken
  ): Promise<vscode.TreeItem> {
    item.tooltip = element.path
    item.command = {
      title: 'Go to definition',
      command: 'vscode.open',
      arguments: [element.path],
    }
    return item
  }
}

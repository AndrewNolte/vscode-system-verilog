import * as vscode from 'vscode'
import { Symbol } from '../analysis/Symbol'
import { ext } from '../extension'
import { ViewComponent } from '../lib/libconfig'
import { DefaultMap } from '../utils'

class InstanceItem {
  path: string
  parent: ModuleItem
  constructor(parent: ModuleItem, path: string) {
    this.path = path
    this.parent = parent
  }
  getParent(): ModuleItem {
    return this.parent
  }

  getTreeItem(): vscode.TreeItem {
    const item = new vscode.TreeItem(this.path, vscode.TreeItemCollapsibleState.None)
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
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
    return item
  }
}

type InstanceTreeItem = InstanceItem | ModuleItem
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

  modulesToInstances: DefaultMap<Symbol, Map<string, InstanceItem>> = new DefaultMap(
    () => new Map<string, InstanceItem>()
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
    // modules (symbols) > instances (module items)
    if (element === undefined) {
      return Array.from(ext.project.instancesByModule.keys()).map((item) => {
        return new ModuleItem(item)
      })
    }
    if (element instanceof ModuleItem) {
      const instances = ext.project.instancesByModule.get(element.definition)
      if (instances) {
        instances.forEach((item) => {
          this.modulesToInstances
            .get(element.definition)
            ?.set(item.getPath(), new InstanceItem(element, item.getPath()))
        })
      }
      return Array.from(this.modulesToInstances.get(element.definition)?.values() ?? [])
    }
    if (element instanceof InstanceItem) {
      return []
    }
    return []
  }

  getParent(element: InstanceTreeItem): vscode.ProviderResult<InstanceTreeItem> {
    if (element instanceof ModuleItem) {
      return undefined
    }
    return element.parent
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
      arguments: [element.parent.definition.doc.uri],
    }
    return item
  }
}

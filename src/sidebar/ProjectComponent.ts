import * as vscode from 'vscode'
import { TreeDataProvider, TreeItem } from 'vscode'
import { ext } from '../extension'
import {
  CommandNode,
  EditorButton,
  TreeItemButton,
  ViewButton,
  ViewComponent,
} from '../lib/libconfig'
import { InstancesView } from './InstancesView'
import * as slang from '../SlangInterface'

const STRUCTURE_SYMS = [
  slang.SlangKind.Instance,
  slang.SlangKind.InstanceArray,
  slang.SlangKind.Scope,
]

interface HasChildren {
  getChildren(): Promise<HierItem[]>
  getChild(name: string): Promise<HierItem | undefined>
  getPath(): string
}
export abstract class HierItem implements HasChildren {
  getPath(): string {
    if (this.path !== undefined) {
      return this.path
    }
    return this.parent!.getChildPath(this.inst.instName)
  }

  getChildPath(name: string): string {
    return this.getPath() + '.' + name
  }
  // the symbol to get children from
  path: string | undefined
  isVirtualLoc: boolean
  inst: slang.Item

  parent: HierItem | undefined
  children: HierItem[] | undefined
  childrenByName: Map<string, HierItem> = new Map()

  constructor(parent: HierItem | undefined, item: slang.Item) {
    this.parent = parent
    this.inst = item
    // blank uri- file://
    this.isVirtualLoc = item.instLoc.uri.length === 7
  }
  async getChildren(): Promise<HierItem[]> {
    if (this.children === undefined) {
      this.children = await this._fetchChildren()
    }
    return this.children
  }

  async getChild(name: string): Promise<HierItem | undefined> {
    if (this.children === undefined) {
      this.children = await this._fetchChildren()
    }
    if (this.childrenByName.size === 0) {
      for (let child of this.children) {
        this.childrenByName.set(child.inst.instName, child)
      }
    }

    return this.childrenByName.get(name)
  }

  async _fetchChildren(): Promise<HierItem[]> {
    return []
  }

  async getTreeItem(): Promise<TreeItem> {
    let item = new TreeItem(this.inst.instName)
    item.iconPath = new vscode.ThemeIcon('chip')
    return item
  }

  async preOrderTraversal(fn: (item: HierItem) => void) {
    fn(this)
    for (let child of await this.getChildren()) {
      await child.preOrderTraversal(fn)
    }
  }

  async hasChildren(): Promise<boolean> {
    return false
  }
}

function mapChildren(parent: HierItem, items: slang.Item[]): HierItem[] {
  const res = []
  for (let item of items) {
    switch (item.kind) {
      case slang.SlangKind.Instance:
        res.push(new InstanceItem(parent, item as slang.Instance))
        break
      case slang.SlangKind.InstanceArray:
        res.push(new InstanceArrayItem(parent, item as slang.Instance))
        break
      case slang.SlangKind.Param:
      case slang.SlangKind.Port:
      case slang.SlangKind.Logic:
        res.push(new VarItem(parent, item as slang.Var))
        break
      case slang.SlangKind.ScopeArray:
        res.push(new ScopeArrayItem(parent, item as slang.Scope))
        break
      case slang.SlangKind.Scope:
        res.push(new ScopeItem(parent, item as slang.Scope))
        break
      default:
        vscode.window.showErrorMessage('Unknown item kind: ' + item.kind)
    }
  }
  return res
}

async function getSlangChildren(parent: HierItem, path: string): Promise<HierItem[]> {
  let items = await slang.getScope(path)
  return mapChildren(parent, items)
}

class ScopeItem extends HierItem {
  // scopes come with children populated
  inst: slang.Scope

  constructor(parent: HierItem | undefined, inst: slang.Scope) {
    super(parent, inst)
    this.inst = inst
  }

  async _fetchChildren(): Promise<HierItem[]> {
    return mapChildren(this, this.inst.children)
  }

  async getTreeItem(): Promise<TreeItem> {
    let item = new TreeItem(this.inst.instName)
    item.iconPath = new vscode.ThemeIcon('symbol-namespace')
    return item
  }
}

class ScopeArrayItem extends ScopeItem {
  getChildPath(name: string): string {
    return this.getPath() + name
  }
}

export class InstanceItem extends HierItem {
  // Used by instances tree view as well
  inst: slang.Instance
  children: HierItem[] | undefined
  constructor(parent: HierItem | undefined, inst: slang.Instance) {
    super(parent, inst)
    this.inst = inst
  }

  async getTreeItem(): Promise<vscode.TreeItem> {
    let item = await super.getTreeItem()
    item.contextValue = 'Module'
    item.iconPath = new vscode.ThemeIcon('chip')
    item.description = this.inst.declName
    return item
  }

  async _fetchChildren(): Promise<HierItem[]> {
    return await getSlangChildren(this, this.getPath())
  }

  async hasChildren(): Promise<boolean> {
    return (await this.getChildren()).length > 0
  }
}

class InstanceArrayItem extends InstanceItem {
  children: InstanceItem[] | undefined

  async _fetchChildren(): Promise<HierItem[]> {
    return mapChildren(this, this.inst.children)
  }

  async hasChildren(): Promise<boolean> {
    return true
  }

  getChildPath(name: string): string {
    return this.getPath() + name
  }
}

export class RootItem extends InstanceItem {
  constructor(instance: slang.Instance) {
    super(undefined, instance)
    this.children = mapChildren(this, instance.children)
  }

  getPath(): string {
    return this.inst.instName
  }
  preOrderTraversal = HierItem.prototype.preOrderTraversal
}

export class UnitItem implements HasChildren {
  children: RootItem[]
  childMap: Map<string, RootItem> = new Map()
  constructor(children: RootItem[]) {
    this.children = children
    for (let child of children) {
      this.childMap.set(child.inst.instName, child)
    }
  }

  async getChildren(): Promise<HierItem[]> {
    return this.children
  }

  async getChild(name: string): Promise<HierItem | undefined> {
    return this.childMap.get(name)
  }

  getPath(): string {
    return '$unit'
  }
}

function splitScope(path: string): string[] {
  const parts = path.split('.')
  const partsWithBrackets = []
  // remove brackets from parts
  for (const part of parts) {
    if (part.includes('[')) {
      const bracketSplit = part.split('[')
      partsWithBrackets.push(bracketSplit[0])
      for (const index of bracketSplit.slice(1)) {
        partsWithBrackets.push('[' + index)
      }
    } else {
      partsWithBrackets.push(part)
    }
  }
  return partsWithBrackets
}

class VarItem extends HierItem {
  inst: slang.Var
  static PARAM_TYPES: slang.SlangKind[] = [slang.SlangKind.Param]
  static DATA_TYPES: slang.SlangKind[] = [slang.SlangKind.Logic, slang.SlangKind.Port]

  constructor(parent: HierItem | undefined, instance: slang.Var) {
    super(parent, instance)
    this.inst = instance
  }

  async getTreeItem(): Promise<TreeItem> {
    const item = new TreeItem(this.inst.instName)
    item.iconPath = new vscode.ThemeIcon('symbol-variable')
    item.description = ''
    switch (this.inst.kind) {
      case slang.SlangKind.Param:
        item.iconPath = new vscode.ThemeIcon('symbol-type-parameter')
        break
      case slang.SlangKind.Port:
        item.iconPath = new vscode.ThemeIcon('symbol-interface')
        break
      case slang.SlangKind.Logic:
        item.iconPath = new vscode.ThemeIcon('symbol-variable')
        break
    }
    // if has value, show value
    if (this.inst.type) {
      item.description += this.inst.type + ' '
    }
    if (this.inst.value) {
      item.description += '= ' + this.inst.value
    }
    return item
  }
}

// class InternalScopeItem extends ScopeItem {
//   constructor(parent: HierItem | undefined, scope: slang.Scope) {
//     super(parent, scope)
//   }
//   async _fetchChildren(): Promise<HierItem[]> {
//     return this.getChildrenFromSymbol(this.instance)
//   }
//   async preOrderTraversal(fn: (item: HierItem) => void) {
//     /// Guard against recursive modules
//     fn(this)
//     for (let child of await this.getChildren()) {
//       if (child.instance !== this.parent!.instance) {
//         await child.preOrderTraversal(fn)
//       }
//     }
//   }
// }k

// class InstanceLink extends vscode.TerminalLink {
//   path: string
//   constructor(path: string, startIndex: number, length: number) {
//     super(startIndex, length, 'Open in Hierarhcy View')
//     this.path = path
//   }
// }

export class ProjectComponent extends ViewComponent implements TreeDataProvider<HierItem> {
  // Top $unit, has top level + packages
  unit: UnitItem | undefined = undefined

  // Top level module, first in unit
  top: RootItem | undefined = undefined

  // Hierarchy Tree
  private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event
  treeView: vscode.TreeView<HierItem> | undefined

  // Instances Index
  // TODO
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
      await slang.setTopLevel(uri.fsPath)
      await this.setTopModule()
    }
  )

  async onStart(): Promise<void> {
    this.setTopModule()
  }

  // setInstanceByFile: EditorButton = new EditorButton(
  //   {
  //     title: 'Select Instance',
  //     icon: '$(symbol-class)',
  //     languages: ['verilog', 'systemverilog'],
  //   },
  //   async (openModule: vscode.Uri | undefined) => {
  //     if (openModule === undefined) {
  //       vscode.window.showErrorMessage('Open a verilog file to select instance')
  //       return
  //     }
  //     // get the module from the current file
  //     const doc = await vscode.workspace.openTextDocument(openModule)
  //     const moduleSym = await selectModule(doc)
  //     if (moduleSym === undefined) {
  //       return
  //     }
  //     // get the instances of the module
  //     let moduleItem: ModuleItem | undefined = undefined
  //     // These are sometimes different symbols instances
  //     for (const [key, value] of this.instancesView.modules.entries()) {
  //       if (key.name === moduleSym.name) {
  //         moduleItem = value
  //         break
  //       }
  //     }
  //     if (moduleItem === undefined) {
  //       return
  //     }
  //     await this.instancesView.treeView?.reveal(moduleItem, {
  //       select: true,
  //       focus: true,
  //       expand: true,
  //     })
  //     const instances: string[] = Array.from(moduleItem.instances.values()).map(
  //       (item: InstanceViewItem) => item.inst.getPath()
  //     )
  //     if (instances.length === 0) {
  //       vscode.window.showErrorMessage('No instances found in module')
  //       return
  //     }
  //     const path = await vscode.window.showQuickPick(instances, {
  //       title: 'Select Instance',
  //     })
  //     if (path === undefined) {
  //       return
  //     }
  //     // look upinstance that was selected
  //     const instance = moduleItem.instances.get(path)
  //     if (instance === undefined) {
  //       return
  //     }
  //     // reveal in sidebar, don't change file
  //     await this.setInstance.func(instance.inst, {
  //       revealHierarchy: true,
  //       revealFile: false,
  //       revealInstance: true,
  //     })
  //   }
  // )

  //////////////////////////////////////////////////////////////////
  // Hierarchy View Buttons
  //////////////////////////////////////////////////////////////////

  clearTopLevel: ViewButton = new ViewButton(
    {
      title: 'Clear Top Level',
      icon: '$(panel-close)',
    },
    async () => {
      await slang.setBuildFile('')
      this.top = undefined
      this.buildfile = undefined
      this.unit = undefined
      await this.instancesView.clearModules()
      this._onDidChangeTreeData.fire()
    }
  )

  // selectTopLevel: ViewButton = new ViewButton(
  //   {
  //     title: 'Select Top Level',
  //     icon: '$(folder-opened)',
  //   },
  //   async (): Promise<boolean> => {
  //     const newtop = await selectModuleGlobal()
  //     if (newtop === undefined) {
  //       return false
  //     }
  //     await this.setTopModule(newtop)
  //     return true
  //   }
  // )

  // setInstanceByPathInternal: ViewButton = new ViewButton(
  //   {
  //     title: 'Set Instance',
  //     icon: '$(inspect)',
  //   },
  //   async (rootItem: RootItem | undefined, instPath: string | undefined) => {
  //     if (instPath === undefined) {
  //       instPath = await vscode.window.showInputBox({
  //         prompt: 'Enter instance path',
  //       })
  //       if (instPath === undefined) {
  //         return
  //       }
  //     }
  //     // instance is a string path, maybe containing brackets from elaboration, so strip those
  //     const regex = /\[\d+\]/g
  //     let cleaned = instPath.replace(regex, '')
  //     let parts = cleaned.split('.')

  //     // try to get top module from path if root not set
  //     const topStr = parts[0]
  //     if (rootItem === undefined && !(this.top?.inst.instName === topStr)) {
  //       if (ext.index.moduleMap.has(topStr)) {
  //         const topUri = ext.index.moduleMap.get(topStr)
  //         if (topUri !== undefined) {
  //           const topDoc = await vscode.workspace.openTextDocument(topUri)
  //           const topModule = await selectModule(topDoc)
  //           if (topModule !== undefined) {
  //             await this.setTopModule(topModule)
  //           }
  //         }
  //       }
  //     }
  //     // root Item is already top, no need to do anything with the value

  //     // have user select top if that didn't work
  //     if (this.top === undefined) {
  //       await this.selectTopLevel.func()
  //       if (this.top === undefined) {
  //         return
  //       }
  //     }

  //     // go through hierarchy
  //     let current: HierItem | undefined = undefined
  //     for (let part of parts) {
  //       let children: HierItem[]
  //       if (current === undefined) {
  //         children = await this.getChildren(current)
  //       } else {
  //         children = await current.getChildren()
  //       }
  //       let child: HierItem | undefined = children.find((child) => child.instance.name === part)
  //       if (child === undefined) {
  //         vscode.window.showErrorMessage(
  //           `Could not find instance ${part} in ${current?.instance.name ?? 'top level'}: ${
  //             current?.instance.typeRef
  //           }`
  //         )
  //         await this.setInstance.func(current, {
  //           revealHierarchy: true,
  //           revealFile: false,
  //           revealInstance: true,
  //         })
  //         if (current instanceof InstanceItem && current.definition !== undefined) {
  //           await vscode.window.showTextDocument(current.definition.doc)
  //         } else if (current) {
  //           await vscode.window.showTextDocument(current.instance.doc)
  //         }

  //         return
  //       }
  //       current = child
  //     }
  //     if (current === undefined) {
  //       return
  //     }
  //     await this.setInstance.func(current)
  //   }
  // )

  // setInstanceByPath: CommandNode = new CommandNode(
  //   {
  //     title: 'Set Instance',
  //   },
  //   async (inst: string) => {
  //     this.setInstanceByPathInternal.func(undefined, inst)
  //   }
  // )

  setInstance: CommandNode = new CommandNode(
    {
      title: 'Set Instance from Instance View',
      hidden: true,
    },
    async (
      instance: HierItem | string | undefined,
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

      // resolve instances if hierarchy path
      if (typeof instance === 'string') {
        // const scopes = await slang.getScopes(instance)
        const scopes = splitScope(instance)
        // Go through hierarchy, revealing each level
        let current: HasChildren = this.unit!
        for (let scope of scopes) {
          let child = await current.getChild(scope)

          if (child === undefined) {
            this.logger.warn(`Could not find instance ${scope} in ${current.getPath()}`)
            break
          }

          current = child
        }

        if (!(current instanceof HierItem)) {
          vscode.window.showErrorMessage('Invalid instance type: ' + typeof current)
          return
        }
        instance = current
      }

      if (revealHierarchy) {
        if (instance.isVirtualLoc && !this.includeHidden) {
          this.toggleHidden.func()
        }
        if (!this.symFilter.has(instance.inst.kind)) {
          switch (instance.inst.kind) {
            case slang.SlangKind.Param:
              await this.toggleParams.func()
              break
            case slang.SlangKind.Logic:
              await this.toggleData.func()
              break
          }
        }
        await this.treeView?.reveal(instance, { select: true, focus: true, expand: true })
      }

      if (revealFile) {
        vscode.window.showTextDocument(vscode.Uri.parse(instance.inst.instLoc.uri), {
          selection: instance.inst.instLoc.range,
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
        this.instancesView.revealPath(instance.inst.declName, instance.getPath())
      }
    }
  )

  buildfile: string | undefined = undefined

  selectBuildFile: ViewButton = new ViewButton(
    {
      title: 'Select build file',
      icon: '$(file-code)',
      shown: true,
    },
    async () => {
      // quick pick from the glob
      const glob = ext.slangConfig.buildPattern
      if (!glob) {
        vscode.window.showErrorMessage('No buildPattern set in any .slang-server.json')
        return
      }
      // can't use workspace findfiles bc the build.f files are probably generated and not in repo
      const files = await ext.findFiles([glob.replace('{}', '*')], true)
      if (files.length === 0) {
        vscode.window.showErrorMessage('No build files found')
        return
      }

      // trim off common prefixes
      const globPre = glob.substring(0, glob.indexOf('{}'))
      const commonPrefixLen = files[0].fsPath.indexOf(globPre) + globPre.length
      const commonPrefix = files[0].fsPath.substring(0, commonPrefixLen)

      let items = files.map((f) => f.fsPath.replace(commonPrefix, ''))
      let selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a build file',
      })
      if (selection === undefined) {
        return
      }

      this.buildfile = commonPrefix + selection
      await slang.setBuildFile(this.buildfile)

      await this.setTopModule()
    }
  )

  //////////////////////////////////////////////////////////////////
  // Symbol Filtering
  //////////////////////////////////////////////////////////////////

  symFilter: Set<string> = new Set<string>(STRUCTURE_SYMS)
  // params / localparams (constants)
  includeParams: boolean = false
  // ports / nets / registers (variables)
  includeData: boolean = false

  // symbols hidden behind macros
  includeHidden: boolean = false

  toggleParams: ViewButton = new ViewButton(
    {
      title: 'Toggle Params',
      icon: '$(symbol-type-parameter)',
    },
    async () => {
      this.includeParams = !this.includeParams
      if (this.includeParams) {
        for (let type of VarItem.PARAM_TYPES) {
          this.symFilter.add(type)
        }
      } else {
        for (let type of VarItem.PARAM_TYPES) {
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
      this.includeData = !this.includeData
      if (this.includeData) {
        for (let type of VarItem.DATA_TYPES) {
          this.symFilter.add(type)
        }
      } else {
        for (let type of VarItem.DATA_TYPES) {
          this.symFilter.delete(type)
        }
      }
      this._onDidChangeTreeData.fire()
    }
  )

  toggleHidden: ViewButton = new ViewButton(
    {
      title: 'Toggle Hidden',
      icon: '$(eye)',
    },
    async () => {
      this.includeHidden = !this.includeHidden
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
      if (item instanceof InstanceItem && item) {
        vscode.window.showTextDocument(vscode.Uri.parse(item.inst.declLoc.uri), {
          selection: item.inst.declLoc.range,
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
        contents: '[Select top level](command:slang.project.selectTopLevel)',
      },
    })
  }

  static RE_INSTANCE_PATHS = /(?<!\/)[\w$]+(\[\d+\])?(\.[\w$]+(\[\d+\])?)+/g

  // provideTerminalLinks(
  //   context: vscode.TerminalLinkContext,
  //   _token: vscode.CancellationToken
  // ): vscode.ProviderResult<InstanceLink[]> {
  //   let links = []
  //   for (let match of context.line.matchAll(ProjectComponent.RE_INSTANCE_PATHS)) {
  //     const line = context.line
  //     const startIndex = line.indexOf(match[0])
  //     const path = match[0]
  //     const topModule = path.split('.')[0]
  //     if (this.top?.instance.name === topModule || ext.index.moduleMap.has(topModule)) {
  //       links.push(new InstanceLink(path, startIndex, path.length))
  //     }
  //   }
  //   return links
  // }
  // handleTerminalLink(link: InstanceLink): vscode.ProviderResult<void> {
  //   this.setInstanceByPathInternal.func(undefined, link.path)
  // }

  async activate(_context: vscode.ExtensionContext): Promise<void> {
    vscode.window.createTreeView
    this.treeView = vscode.window.createTreeView(this.configPath!, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: undefined,
      manageCheckboxStateManually: false,
    })
    // If you actually register it, you don't get the collapsible state button :/ Thanks Microsoft
    // context.subscriptions.push(vscode.window.registerTreeDataProvider(this.configPath!, this))

    // context.subscriptions.push(vscode.window.registerTerminalLinkProvider(this))
  }

  async setTopModule() {
    const unit = await slang.getTop()
    // this.top = new RootItem(top)
    this.unit = new UnitItem(unit.map((item) => new RootItem(item)))
    this.top = this.unit.children[0]

    if (this.top !== undefined && this.treeView !== undefined) {
      this.treeView.reveal(this.top, { select: true, focus: true })
      this._onDidChangeTreeData.fire()
    }
    this.instancesView.updateModules()
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
      if (this.unit === undefined) {
        return []
      }
      return this.unit.getChildren()
    }
    const children = await element.getChildren()
    const filtered = children.filter((child) => this.symFilter.has(child.inst.kind))
    if (this.includeHidden) {
      return filtered
    }
    return filtered.filter((child) => !child.isVirtualLoc)
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
    // item.tooltip = element.instName
    item.command = {
      title: 'Go to definition',
      command: 'slang.project.setInstance',
      arguments: [element, { revealHierarchy: false, revealFile: true, revealInstance: true }],
    }

    return item
  }
}

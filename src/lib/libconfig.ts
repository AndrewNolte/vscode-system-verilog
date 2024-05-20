import * as child_process from 'child_process'
import { readFile, writeFile } from 'fs/promises'
import * as process from 'process'
import * as vscode from 'vscode'
import { JSONSchemaType } from './jsonSchema'
import { Logger, StubLogger, createLogger } from './logger'
import { IConfigurationPropertySchema } from './vscodeConfigs'

class ExtensionNode {
  nodeName: string | undefined
  configPath: string | undefined
  _parentNode: ExtensionComponent | undefined

  onConfigUpdated(func: () => Promise<void> | void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(this.configPath!)) {
        func()
      }
    })
  }

  compile(nodeName: string, parentNode?: ExtensionComponent): void {
    this._parentNode = parentNode
    this.nodeName = nodeName

    if (parentNode) {
      this.configPath = [parentNode.configPath, this.nodeName].join('.')
    } else {
      // root node
      this.configPath = this.nodeName
    }
  }
}

export abstract class ExtensionComponent extends ExtensionNode {
  /**
   * Container for extensions functionality and config
   */
  logger: Logger
  private children: ExtensionNode[]

  constructor() {
    super()
    this.logger = new StubLogger()
    this.children = []
  }

  public async activateExtension(
    nodeName: string,
    context: vscode.ExtensionContext,
    incompatibleExtensions?: string[]
  ): Promise<void> {
    this.compile(nodeName)

    this.postOrderTraverse(async (node: ExtensionNode) => {
      if (node instanceof ExtensionComponent || node instanceof CommandNode) {
        await node.activate(context)
      }
      if (node instanceof ConfigObject) {
        node.getValue()
      }
    })

    if (context.extensionMode !== vscode.ExtensionMode.Production) {
      vscode.commands.registerCommand('extdev.updateConfig', async () => {
        // update package.json
        {
          let filePath = context.extensionPath + '/package.json'
          const data = await readFile(filePath, { encoding: 'utf-8' })
          let json = JSON.parse(data)

          // update config properties
          this.updateJson(json)

          const updatedJson = JSON.stringify(json, null, 2)
          await writeFile(filePath, updatedJson, { encoding: 'utf-8' })
        }

        // update config.md
        {
          let filePath = context.extensionPath + '/CONFIG.md'
          await writeFile(filePath, this.getConfigMd(), { encoding: 'utf-8' })
        }
      })
    }

    if (incompatibleExtensions !== undefined) {
      for (let id of incompatibleExtensions) {
        if (vscode.extensions.getExtension(id) !== undefined) {
          vscode.window.showErrorMessage(`Please uninstall incompatible extension: ${id}`)
        }
      }
    }
  }

  preOrderConfigTraverse<T extends JSONSchemaType>(func: (obj: ConfigObject<T>) => void): void {
    this.preOrderTraverse((obj: ExtensionNode) => {
      if (obj instanceof ConfigObject) {
        func(obj)
      }
    })
  }

  preOrderComponentTraverse(func: (obj: ExtensionComponent) => void): void {
    this.preOrderTraverse((obj: ExtensionNode) => {
      if (obj instanceof ExtensionComponent) {
        func(obj)
      }
    })
  }

  preOrderTraverse(func: (obj: ExtensionNode) => void): void {
    func(this)
    this.children.forEach((obj: ExtensionNode) => {
      if (obj instanceof ExtensionComponent) {
        obj.preOrderTraverse(func)
      } else {
        func(obj)
      }
    })
  }

  postOrderTraverse(func: (obj: ExtensionNode) => void): void {
    this.children.forEach((obj: ExtensionNode) => {
      if (obj instanceof ExtensionComponent) {
        obj.preOrderTraverse(func)
      } else {
        func(obj)
      }
    })
    func(this)
  }

  compile(nodeName: string, parentNode?: ExtensionComponent): void {
    super.compile(nodeName, parentNode)

    if (parentNode) {
      this.logger = parentNode.logger?.getChild(this.nodeName!)
    } else {
      // root node
      this.logger = createLogger(this.nodeName!)
    }

    const subTypeProperties = Object.getOwnPropertyNames(this).filter(
      (childName) => !childName.startsWith('_')
    )
    for (let childName of subTypeProperties) {
      // get the property values
      let obj: any = (this as any)[childName]
      if (!(obj instanceof ExtensionNode)) {
        continue
      }

      obj.compile(childName, this)
      this.children.push(obj)
    }
  }

  showErrorMessage(msg: string) {
    vscode.window.showErrorMessage(`[${this.configPath}] ${msg}`)
  }

  /**
   * Override this. Activated in a preorder traversal
   */
  async activate(_context: vscode.ExtensionContext): Promise<void> {}

  getViews(): ViewComponent[] {
    return this.children.filter((child) => child instanceof ViewComponent) as ViewComponent[]
  }

  getViewButtons(): ViewButton[] {
    return this.children.filter((child) => child instanceof ViewButton) as ViewButton[]
  }

  updateJson(json: any): void {
    /// Update package.json from compiled values
    {
      // config
      let props: any = {}
      this.preOrderConfigTraverse((obj: ConfigObject<any>) => {
        props[obj.configPath!] = obj.getConfigJson()
      })
      json.contributes.configuration.properties = props
    }

    {
      // view containers
      let contiainers: any = { activitybar: [], panel: [] }
      let views: any = {}
      let viewsWelcome: any = []
      let viewsTitleButtons: any = []
      let viewsInlineButtons: any = []
      this.preOrderComponentTraverse((cont: ExtensionComponent) => {
        if (!(cont instanceof ViewContainerComponent)) {
          return
        }
        if (cont instanceof ActivityBarComponent) {
          contiainers.activitybar.push(cont.obj)
        }
        if (cont instanceof PanelComponent) {
          contiainers.panel.push(cont.obj)
        }
        // get views from containers
        views[cont.obj.id] = []
        for (let view of cont.getViews()) {
          // remove vobj.welcome if exists, ad id
          let vobjCopy: any = {
            id: view.configPath,
            ...view.obj,
          }
          delete vobjCopy.welcome
          // vobjCopy.id = view.configPath
          views[cont.obj.id].push(vobjCopy)

          if (view.obj.welcome) {
            let welc: any = {
              view: view.configPath,
              ...view.obj.welcome,
            }
            viewsWelcome.push(welc)
          }

          for (let button of view.getViewButtons()) {
            // TODO: alt? more complex 'when' clause? other 'group' options?
            let obj = {
              command: button.configPath,
              when: '',
              group: '',
            }
            if (button instanceof TitleButton) {
              obj.when = `view == ${view.configPath}`
              obj.group = 'navigation'
              viewsTitleButtons.push(obj)
            }
            if (button instanceof InlineButton) {
              obj.when = `viewItem == ${button.context}`
              obj.group = 'inline'
              viewsInlineButtons.push(obj)
            }
          }
        }
      })
      json.contributes.viewsContainers = contiainers
      json.contributes.views = views
      json.contributes.viewsWelcome = viewsWelcome
      if (json.contributes.menus === undefined) {
        json.contributes.menus = {}
      }
      json.contributes.menus['view/title'] = viewsTitleButtons
      json.contributes.menus['view/item/context'] = viewsInlineButtons
    }

    {
      // editor buttons
      let editorButtons: any = []
      this.preOrderTraverse((node: ExtensionNode) => {
        if (node instanceof EditorButton) {
          let obj = {
            command: node.configPath,
            when: node.languages.map((lang) => `resourceLangId == ${lang}`).join(' || '),
            group: 'navigation',
          }
          editorButtons.push(obj)
        }
      })
      json.contributes.menus['editor/title'] = editorButtons
    }

    {
      // commands
      let commands: any = []
      this.preOrderTraverse((node: ExtensionNode) => {
        if (node instanceof CommandNode) {
          let cmd = { command: node.configPath, ...node.obj }
          commands.push(cmd)
        }
      })

      // TODO: maybe remove this for production?
      commands.push({
        command: 'extdev.updateConfig',
        title: 'Extdev: update config (package.json and CONFIG.md)',
      })
      json.contributes.commands = commands
    }
  }

  getConfigMd(): string {
    let out = '## Configuration Settings\n\n'
    this.preOrderConfigTraverse((obj: ConfigObject<any>) => {
      out += obj.getMarkdownString()
    })
    return out
  }
}

////////////////////////////////////////////////////
// Commands
////////////////////////////////////////////////////
type iconType = string | { dark: string; light: string }
interface CommandSpec {
  // command: string // filled in automatically
  title: string
  category?: string
  enablement?: string
  icon?: iconType
  when?: string
  shortTitle?: string
}
export class CommandNode extends ExtensionNode {
  obj: CommandSpec
  func: (...args: any[]) => any
  thisArg?: any
  constructor(obj: CommandSpec, func: (...args: any[]) => any, thisArg?: any) {
    super()
    this.obj = obj
    this.func = func
    this.thisArg = thisArg
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
      vscode.commands.registerCommand(this.configPath!, this.func, this.thisArg)
    )
  }
}

export class EditorButton extends CommandNode {
  languages: string[]
  constructor(languages: string[], obj: CommandSpec, func: (...args: any[]) => any, thisArg?: any) {
    super(obj, func, thisArg)
    this.languages = languages
  }
}

////////////////////////////////////////////////////
// Views
////////////////////////////////////////////////////

export interface ViewContainerSpec {
  id: string
  title: string
  icon: string
}
class ViewContainerComponent extends ExtensionComponent {
  obj: ViewContainerSpec
  constructor(obj: ViewContainerSpec) {
    super()
    this.obj = obj
  }
}
export class ActivityBarComponent extends ViewContainerComponent {}
export class PanelComponent extends ViewContainerComponent {}

export interface WelcomeSpec {
  // view: string // filled in automatically
  contents: string
  enablement?: string
  group?: string
  when?: string
}

export interface ViewSpec {
  // id: string // filled in automatically
  name: string
  welcome?: WelcomeSpec
}

export class ViewComponent extends ExtensionComponent {
  obj: ViewSpec
  constructor(obj: ViewSpec) {
    super()
    this.obj = obj
  }
}

class ViewButton extends CommandNode {}
export class TitleButton extends ViewButton {}

export class InlineButton extends ViewButton {
  context: string
  constructor(context: string, obj: CommandSpec, func: (...args: any[]) => any, thisArg?: any) {
    super(obj, func, thisArg)
    this.context = context
  }
}

////////////////////////////////////////////////////
// Config Leaf
////////////////////////////////////////////////////
export class ConfigObject<T extends JSONSchemaType> extends ExtensionNode {
  protected obj: any
  default: T
  cachedValue: T

  constructor(obj: IConfigurationPropertySchema) {
    super()
    this.obj = obj
    this.default = obj.default
    this.cachedValue = obj.default
  }

  getValue(): T {
    this.cachedValue = vscode.workspace.getConfiguration().get(this.configPath!, this.default!)
    return this.cachedValue
  }

  listen(): void {
    this.onConfigUpdated(() => {
      this.getValue()
    })
  }

  getConfigJson(): any {
    // TODO: use reflection to get the right type
    // type Inspect<T> = T extends infer R ? { type: R } : never
    if (this.obj['type'] === undefined) {
      if (typeof this.default === 'string') {
        this.obj['type'] = 'string'
      } else if (typeof this.default === 'number') {
        this.obj['type'] = 'number'
      } else if (typeof this.default === 'boolean') {
        this.obj['type'] = 'boolean'
      } else if (Array.isArray(this.default)) {
        this.obj['type'] = 'array'
        this.obj['items'] = {
          type: 'string',
        }
      } else {
        throw Error(`Was not able to deduce type for ${this.configPath}`)
      }
    }
    return this.obj
  }

  getMarkdownString(): string {
    let cfgjson = this.getConfigJson()
    let out = `- \`${this.configPath}\`: ${cfgjson.type} = `
    if (cfgjson.type === 'string') {
      out += `"${this.default}"\n\n`
    } else if (cfgjson.type === 'array') {
      out += `[]\n\n`
    } else {
      out += `${this.default}\n\n`
    }
    out += `    ${cfgjson.description}\n\n`
    if (cfgjson.type === 'enum') {
      out += `    Options:\n`
      for (let option of cfgjson.enum) {
        out += `    - ${option}\n`
      }
    }
    out += '\n'
    return out
  }
}

type Platform = 'windows' | 'linux' | 'mac'

type PlatformMap = { [key in Platform]: string }

type PathConfigSchema = Omit<IConfigurationPropertySchema, 'default'>
export class PathConfigObject extends ConfigObject<string> {
  platformDefaults: PlatformMap
  constructor(obj: PathConfigSchema, platformDefaults: PlatformMap) {
    let configObj: IConfigurationPropertySchema = obj
    configObj.default = JSON.stringify(platformDefaults)
    super(configObj)
    this.platformDefaults = platformDefaults
  }

  getValue(): string {
    let path = super.getValue()
    if (path === '' || path.startsWith('{')) {
      path = this.platformDefaults[getPlatform()]
    }
    path = this.getAbsPath(path)

    this.cachedValue = path
    return path
  }

  getAbsPath(path: string): string {
    if (getPlatform() === 'windows') {
      if (!path.match(/^[a-zA-Z]:\\/)) {
        child_process.execFile('cmd.exe', ['/c', `where ${path}`], (error, stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error.message}`)
            path = ''
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`)
            path = ''
          }
          path = stdout.split('\r\n')[0].trim() // Taking the first result if multiple are returned
        })
      }
    } else {
      // mac and linux
      if (!path.startsWith('/')) {
        // Using bash to execute the `which` command
        child_process.execFile(
          vscode.env.shell,
          ['-c', `which ${path}`],
          (error, stdout, stderr) => {
            if (error) {
              console.error(`Error: ${error.message}`)
              path = ''
            }
            if (stderr) {
              console.error(`stderr: ${stderr}`)
              path = ''
            }
            return stdout.trim()
          }
        )
      }
    }
    return path
  }

  async checkPath(): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      child_process.execFile(this.getValue(), { encoding: 'utf-8' }, (error, _stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`)
          resolve(false)
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`)
          resolve(false)
        }
        resolve(true)
      })
    })
  }

  async checkPathNotify(): Promise<boolean> {
    let ret = await this.checkPath()
    if (!ret) {
      vscode.window.showErrorMessage(
        `"${this.getValue()}" not found. Configure ${
          this.configPath
        }, add to PATH, or disable in config.`
      )
    }
    return ret
  }
}

export function getPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return 'windows'
    case 'darwin':
      return 'mac'
    default:
      // includes WSL
      return 'linux'
  }
}

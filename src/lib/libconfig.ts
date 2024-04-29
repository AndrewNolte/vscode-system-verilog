import * as vscode from 'vscode'
import { Logger, StubLogger, createLogger } from './logger'

import * as child_process from 'child_process'
import { IConfigurationPropertySchema } from './vscodeConfigs'
import { JSONSchemaType } from './jsonSchema'
import * as process from 'process'

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
    context: vscode.ExtensionContext
  ): Promise<void> {
    this.compile(nodeName)
    this.postOrderTraverse(async (node: ExtensionNode) => {
      if (node instanceof ExtensionComponent) {
        await node.activate(context)
      }
      if (node instanceof ConfigObject) {
        node.getValue()
      }
    })
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

  getConfigJson(): any {
    let props: any = {}
    this.preOrderConfigTraverse((obj: ConfigObject<any>) => {
      props[obj.configPath!] = obj.getConfigJson()
    })

    return props
  }

  getConfigMd(): string {
    let out = '## Configuration Settings\n\n'
    this.preOrderConfigTraverse((obj: ConfigObject<any>) => {
      out += obj.getMarkdownString()
    })
    return out
  }
}

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
      let userShell = process.env.SHELL ?? '/bin/bash'
      if (!path.startsWith('/')) {
        // Using bash to execute the `which` command
        child_process.execFile(userShell, ['-c', `which ${path}`], (error, stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error.message}`)
            path = ''
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`)
            path = ''
          }
          return stdout.trim()
        })
      }
    }
    return path
  }

  async checkPath(): Promise<boolean> {
    return new Promise((resolve, _reject) => {
      child_process.execFile(
        this.getValue(),
        ['--version'],
        { encoding: 'utf-8' },
        (error, _stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error.message}`)
            resolve(false)
          }
          if (stderr) {
            console.error(`stderr: ${stderr}`)
            resolve(false)
          }
          resolve(true)
        }
      )
    })
  }

  async checkPathNotify(): Promise<boolean> {
    let ret = await this.checkPath()
    if (!ret) {
      vscode.window.showErrorMessage(`${this.configPath} not found at "${this.getValue()}"`)
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
      return 'linux'
  }
}

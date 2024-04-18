import * as vscode from 'vscode'
import { Logger, StubLogger, createLogger } from './logger'

class ExtensionNode {
  nodeName: string | undefined
  configPath: string | undefined
  _parentNode: ExtensionComponent | undefined

  onConfigUpdated(func: () => void): vscode.Disposable {
    func()
    return vscode.workspace.onDidChangeConfiguration((e) => {
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

type ConfigType = number | string | boolean | string[]
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

  public activateExtension(nodeName: string, context: vscode.ExtensionContext): void {
    this.compile(nodeName)
    this.preOrderTraverse((node: ExtensionNode) => {
      if (node instanceof ExtensionComponent) {
        node.activate(context)
      }
      if (node instanceof ConfigObject) {
        node.getValue()
      }
    })
  }

  preOrderConfigTraverse<T extends ConfigType>(func: (obj: ConfigObject<T>) => void): void {
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
  activate(_context: vscode.ExtensionContext): void {}

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

export class ConfigObject<T extends ConfigType> extends ExtensionNode {
  private obj: any
  default: T
  cachedValue: T

  constructor(obj: {
    default: T
    description: string
    scope?: string
    type?: string
    enum?: string[]
    items?: any
  }) {
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
    this.onConfigUpdated(() => this.getValue())
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

import { getVSCodeDownloadUrl } from '@vscode/test-electron/out/util'
import * as vscode from 'vscode'
import { Logger, StubLogger, createLogger } from './logger'
import { integer } from 'vscode-languageclient'

type ConfigType = number | string | boolean | string[]

export class ConfigNode {
  // these need to be ignored
  // set after compile
  nodeName: string | undefined
  configPath: string | undefined
  _parentNode: ConfigNode | undefined
  logger: Logger
  listeners: (() => void)[] = []
  children: ConfigNode[]
  constructor() {
    this.logger = new StubLogger()
    this.listeners = []
    this.children = []
  }

  public compile(nodeName: string, parentNode?: ConfigNode): void {
    this._parentNode = parentNode
    this.nodeName = nodeName

    if (parentNode) {
      console.assert(parentNode.configPath, 'configPath must be set on parentNode')
      this.configPath = [parentNode.configPath, this.nodeName].join('.')
      this.logger = parentNode.logger?.getChild(this.nodeName!)
    } else {
      // root node
      this.configPath = this.nodeName
      this.logger = createLogger(this.nodeName!)
    }
    console.log(this.configPath)

    const subTypeProperties = Object.getOwnPropertyNames(this).filter(
      (childName) => !childName.startsWith('_')
    )
    for (let childName of subTypeProperties) {
      // get the property values
      let obj: any = (this as any)[childName]
      if (!(obj instanceof ConfigNode)) {
        continue
      }

      obj.compile(childName, this)
      this.children.push(obj)
    }

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.configPath!)) {
        this.configUpdated()
      }
    })
  }

  // override this
  activate(context: vscode.ExtensionContext): void {
    this.configUpdated()
    this.children.forEach((obj: ConfigNode) => {
      obj.activate(context)
    })
  }

  async configUpdated(): Promise<void> {
    for (let listener of this.listeners) {
      listener()
    }
  }

  onConfigUpdate(func: () => void): void {
    this.listeners.push(func)
  }

  forEachChild(func: (obj: ConfigObject<any>) => void): void {
    this.children.forEach((obj: ConfigNode) => {
      if (obj instanceof ConfigObject) {
        func(obj)
      }

      obj.forEachChild(func)
    })
  }
  getConfigJson(): any {
    let obj: any = { configuration: { title: `${this.nodeName} configuration` } }

    let props: any = {}
    this.forEachChild((obj: ConfigObject<any>) => {
      // console.log(obj.getConfigJson())
      props[obj.configPath!] = obj.getConfigJson()
    })

    obj['properties'] = props

    // console.log(JSON.stringify(obj, null, 2))
    // write to file
    return obj
    // vscode.workspace.openTextDocument({
    //   content: JSON.stringify(obj, null, 2),
    //   language: 'json',
    // })
  }

  // [key: string]: any
}

export class ConfigObject<T extends ConfigType> extends ConfigNode {
  scope?: string
  default?: T
  description: string
  cachedValue: T
  obj: any

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
    this.description = obj.description
  }

  getValue(): T {
    this.cachedValue = vscode.workspace.getConfiguration().get(this.configPath!, this.default!)
    return this.cachedValue
  }

  listen(): void {
    this.onConfigUpdate(this.getValue.bind(this))
  }

  getConfigJson(): any {
    // use reflection to get the right type
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
      } // check if enum
    }
    return this.obj
    // return JSON.stringify(obj)
  }
}

function isStringEnum(obj: any): boolean {
  for (const value of Object.values(obj)) {
    if (typeof value !== 'string') {
      return false
    }
  }
  return true
}

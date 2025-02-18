import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { ConfigObject, ExtensionComponent } from './lib/libconfig'
import { anyVerilogSelector, systemverilogSelector } from './utils'

export class LanguageServerComponent extends ExtensionComponent {
  languageClients = new Map<string, LanguageClient>()

  svls: BaseLanguageServer = new BaseLanguageServer('svls')
  veridian: BaseLanguageServer = new BaseLanguageServer('veridian')
  veribleVerilogLs: BaseLanguageServer = new BaseLanguageServer('verible-verilog-ls')
  slang: BaseLanguageServer = new BaseLanguageServer('slang-server')

  async activate(context: vscode.ExtensionContext) {
    this.initAllLanguageClients()
    context.subscriptions.push(
      this.onConfigUpdated(async () => {
        await this.stopAllLanguageClients()
        this.initAllLanguageClients()
      })
    )
  }

  initAllLanguageClients() {
    // init svls
    this.svls.setupLanguageClient([], ['--debug'], {
      documentSelector: systemverilogSelector,
    })

    // init veridian
    this.veridian.setupLanguageClient([], [], {
      documentSelector: systemverilogSelector,
    })

    // init verible-verilog-ls
    this.veribleVerilogLs.setupLanguageClient([], [], {
      documentSelector: anyVerilogSelector,
    })

    this.slang.setupLanguageClient([], [], {
      documentSelector: anyVerilogSelector,
    })
  }

  async stopAllLanguageClients(): Promise<any> {
    var p = []
    for (const [name, client] of this.languageClients) {
      if (client.isRunning()) {
        p.push(client.stop())
        this.logger.info('"' + name + '" language server stopped.')
      }
    }
    return Promise.all(p)
  }
}
class BaseLanguageServer extends ExtensionComponent {
  enabled: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Enable this Language Server',
  })
  path: ConfigObject<string>
  toolName: string
  constructor(toolName: string) {
    super()
    this.toolName = toolName
    this.path = new ConfigObject({
      default: toolName,
      description: '',
    })
  }

  async activate(_context: vscode.ExtensionContext): Promise<void> {}

  setupLanguageClient(
    serverArgs: string[],
    serverDebugArgs: string[],
    clientOptions: LanguageClientOptions
  ): LanguageClient | undefined {
    let enabled: boolean = this.enabled.getValue()
    let binPath = this.path.getValue()

    if (!enabled) {
      return undefined
    }

    let serverOptions: ServerOptions = {
      run: { command: binPath, args: serverArgs },
      debug: { command: binPath, args: serverDebugArgs },
    }

    let lc = new LanguageClient(
      this.toolName,
      this.toolName + ' language server',
      serverOptions,
      clientOptions
    )

    lc.start()
    this.logger.info(`${this.toolName} language server started`)
    return lc
  }
}

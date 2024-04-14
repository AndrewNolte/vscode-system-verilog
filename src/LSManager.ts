import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { ExtensionComponent, ConfigObject } from './libconfig'
import * as vscode from 'vscode'

export class LanguageServerManager extends ExtensionComponent {
  languageClients = new Map<string, LanguageClient>()

  svls: BaseLanguageServer = new BaseLanguageServer('svls')
  veridian: BaseLanguageServer = new BaseLanguageServer('veridian')
  hdlChecker: BaseLanguageServer = new BaseLanguageServer('hdl_checker')
  veribleVerilogLs: BaseLanguageServer = new BaseLanguageServer('verible-verilog-ls')
  rustHdl: BaseLanguageServer = new BaseLanguageServer('rust_hdl')

  activate(context: vscode.ExtensionContext) {
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
      documentSelector: [{ scheme: 'file', language: 'systemverilog' }],
    })

    // init veridian
    this.veridian.setupLanguageClient([], [], {
      documentSelector: [{ scheme: 'file', language: 'systemverilog' }],
    })

    // init hdlChecker
    this.hdlChecker.setupLanguageClient(['--lsp'], ['--lsp'], {
      documentSelector: [
        { scheme: 'file', language: 'verilog' },
        { scheme: 'file', language: 'systemverilog' },
        { scheme: 'file', language: 'vhdl' },
      ],
    })

    // init verible-verilog-ls
    this.veribleVerilogLs.setupLanguageClient([], [], {
      documentSelector: [{ scheme: 'file', language: 'systemverilog' }],
    })

    // init rustHdl
    this.rustHdl.setupLanguageClient([], [], {
      documentSelector: [{ scheme: 'file', language: 'vhdl' }],
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

  activate(_context: vscode.ExtensionContext): void {}

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
    this.logger.info('language server started.')
    return lc
  }
}

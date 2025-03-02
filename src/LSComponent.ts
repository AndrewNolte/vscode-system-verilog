import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { CommandNode, ConfigObject, ExtensionComponent } from './lib/libconfig'
import { anyVerilogSelector, systemverilogSelector } from './utils'

export enum LanguageServers {
  Ctags = 'ctags',
  Slang = 'slang-server',
  Svls = 'svls',
  Veridian = 'veridian',
  VeribleVerilogLs = 'verible-verilog-ls',
}

// map from enum to client options
const languageServerOptions: Record<LanguageServers, LanguageClientOptions> = {
  [LanguageServers.Ctags]: {
    documentSelector: anyVerilogSelector,
  },
  [LanguageServers.Slang]: {
    documentSelector: anyVerilogSelector,
  },
  [LanguageServers.Svls]: {
    documentSelector: systemverilogSelector,
  },
  [LanguageServers.Veridian]: {
    documentSelector: systemverilogSelector,
  },
  [LanguageServers.VeribleVerilogLs]: {
    documentSelector: anyVerilogSelector,
  },
}

export class LanguageServerComponent extends ExtensionComponent {
  path: ConfigObject<string> = new ConfigObject({
    default: '',
    description: 'Path to the language server',
  })
  server: ConfigObject<LanguageServers> = new ConfigObject({
    enum: Object.values(LanguageServers),
    default: LanguageServers.Ctags,
    description: 'Selected Language server',
  })

  args: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Arguments to pass to the server',
  })

  debugArgs: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Arguments to pass to the server when debugging',
  })

  restartLanguageServer: CommandNode = new CommandNode(
    {
      title: 'Restart Language Server',
    },
    async () => {
      if (this.client === undefined) {
        await vscode.window.showErrorMessage('To restart Ctags, reload the window.')
        return
      }

      await this.client.restart()
      this.logger.info('"' + this.client.name + '" language server started')
    }
  )

  client: LanguageClient | undefined

  async activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      this.onConfigUpdated(async () => {
        if (this.client !== undefined) {
          await this.client.stop()
        }
        await this.setupLanguageClient()
      })
    )
    await this.setupLanguageClient()
  }

  async stop() {
    if (this.client !== undefined) {
      await this.client.stop()
      this.client = undefined
    }
  }

  async setupLanguageClient(): Promise<void> {
    const selection = this.server.getValue()
    if (selection === LanguageServers.Ctags) {
      this.logger.info('Ctags language server selected... no server to client to set up')
      return
    }
    const serverOptions: ServerOptions = {
      run: { command: this.path.getValue(), args: this.args.getValue() },
      debug: { command: this.path.getValue(), args: this.debugArgs.getValue() },
    }
    const clientOptions = languageServerOptions[selection]

    this.client = new LanguageClient(selection, selection, serverOptions, clientOptions)
    await this.client.start()
    this.logger.info(`${selection} language server started`)
  }
}

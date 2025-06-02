// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'

import { glob } from 'glob'
import path from 'path'
import { promisify } from 'util'
import * as vscodelc from 'vscode-languageclient/node'
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'
import { SystemVerilogFormatProvider, VerilogFormatProvider } from './FormatProvider'
import { IncludeConfig } from './IncludeConfig'
import { IndexComponent } from './IndexComponent'
import {
  ActivityBarComponent,
  CommandNode,
  ConfigObject,
  ExternalEditorButton,
  PathConfigObject,
  ViewContainerSpec,
} from './lib/libconfig'
import LintManager from './linter/LintManager'
import { ProjectComponent } from './sidebar/ProjectComponent'
import { getWorkspaceFolder, systemverilogSelector } from './utils'
import * as slang from './SlangInterface'
const asyncGlob = promisify(glob)

export var ext: VerilogExtension

export enum SvStandard {
  SV2005 = 'SystemVerilog-2005',
  SV2009 = 'SystemVerilog-2009',
  SV2012 = 'SystemVerilog-2012',
  SV2017 = 'SystemVerilog-2017',
  //   sv2023 = 'SystemVerilog2023',
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum VerilogStandard {
  V1995 = 'Verilog-95',
  V2001 = 'Verilog-2001',
  V2005 = 'Verilog-2005',
}

export class VerilogExtension extends ActivityBarComponent {
  index: IndexComponent = new IndexComponent()
  ////////////////////////////////////////////////
  /// top level configs
  ////////////////////////////////////////////////
  includes: IncludeConfig = new IncludeConfig({
    default: [],
    description: 'Include paths to pass as -I to tools',
  })

  svStandard: ConfigObject<SvStandard> = new ConfigObject({
    default: SvStandard.SV2017,
    description: 'System Verilog standard to use for external linters',
    enum: Object.values(SvStandard),
  })
  verilogStandard: ConfigObject<VerilogStandard> = new ConfigObject({
    default: VerilogStandard.V2005,
    description: 'Verilog standard to use for external linters',
    enum: Object.values(VerilogStandard),
  })
  formatDirs: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Directories to format',
  })

  ////////////////////////////////////////////////
  /// extension subcomponents
  ////////////////////////////////////////////////
  lint: LintManager = new LintManager()

  svFormat: SystemVerilogFormatProvider = new SystemVerilogFormatProvider()
  verilogFormat: VerilogFormatProvider = new VerilogFormatProvider()

  project: ProjectComponent = new ProjectComponent()

  ////////////////////////////////////////////////
  /// top level commands and configs
  ////////////////////////////////////////////////

  expandMacros: ExternalEditorButton = new ExternalEditorButton({
    title: 'Expand Macros',
    shortTitle: 'Expand macros',
    languages: ['verilog', 'systemverilog'],
    icon: '$(open-preview)',
  })

  client: LanguageClient | undefined

  path: PathConfigObject = new PathConfigObject(
    {
      description: 'Path to the slang-server (not slang)',
    },
    {
      windows: 'slang-server.exe',
      linux: 'slang-server',
      mac: 'slang-server',
    }
  )

  args: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Arguments to pass to the slang-server',
  })

  debugArgs: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Arguments to pass to slang-server when debugging',
  })

  slangConfig: slang.Config = {}

  async setupLanguageClient(): Promise<void> {
    this.logger.info('starting language server')
    const slangServerPath = await this.path.getValueAsync()
    const serverOptions: ServerOptions = {
      run: { command: slangServerPath, args: this.args.getValue() },
      debug: { command: slangServerPath, args: this.debugArgs.getValue() },
    }

    const clientOptions: LanguageClientOptions = {
      documentSelector: systemverilogSelector,
    }

    this.client = new LanguageClient('slang-server', serverOptions, clientOptions)
    this.context.subscriptions.push(
      this.client.onDidChangeState(({ newState }) => {
        if (newState === vscodelc.State.Running) {
          // clangd starts or restarts after crash.
          this.client!.onNotification('slang/setConfig', (config: slang.Config) => {
            this.slangConfig = config
            this.findModules()
          })
        }
      })
    )

    await this.client.start()
    this.logger.info('language server started')
    await this.project.onStart()
  }

  restartLanguageServer: CommandNode = new CommandNode(
    {
      title: 'Restart Language Server',
    },
    async () => {
      await this.project.clearTopLevel.func()
      if (this.client !== undefined && this.client.isRunning()) {
        await this.client.restart()
        await this.project.onStart()
        this.logger.info('"' + this.client.name + '" language server restarted')
      } else {
        await this.setupLanguageClient()
      }
      await this.showOutput.func()
    }
  )

  showOutput: CommandNode = new CommandNode(
    {
      title: 'Show Output',
    },
    async () => {
      if (this.client !== undefined) {
        this.client.outputChannel.show()
      }
    }
  )

  async stopServer() {
    if (this.client !== undefined) {
      await this.client.stop()
      this.client = undefined
    }
  }

  context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext, obj: ViewContainerSpec) {
    super(obj)
    this.context = context
  }

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

    // Lets do this quickly
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint.lint(editor.document)
    })

    /////////////////////////////////////////////
    // Configure Format on save
    /////////////////////////////////////////////

    this.onConfigUpdated(() => {
      this.checkFormatDirs()
    })
    await this.checkFormatDirs()

    this.logger.info(`${context.extension.id} activation finished.`)
  }

  private async checkFormatDirs() {
    let dirs = this.formatDirs.getValue()
    this.svFormat.activateFormatter(dirs, ['sv', 'svh'], 'systemverilog')
    this.verilogFormat.activateFormatter(dirs, ['v', 'vh'], 'verilog')
  }

  public async findFiles(globs: string[], useGlob = false): Promise<vscode.Uri[]> {
    let ws = getWorkspaceFolder()
    if (ws === undefined) {
      return []
    }

    // TODO: maybe use this.slangConfig.exclude.excludeDirs

    const find = async (str: string): Promise<vscode.Uri[]> => {
      let ret: vscode.Uri[]
      if (path.isAbsolute(str)) {
        ret = (await asyncGlob(str)).map((p) => vscode.Uri.file(p))
      } else if (useGlob) {
        ret = (await asyncGlob(path.join(ws, str))).map((p) => vscode.Uri.file(p))
      } else {
        ret = await vscode.workspace.findFiles(new vscode.RelativePattern(ws, str))
      }
      return ret
    }
    let uriList: vscode.Uri[][] = await Promise.all(globs.map(find))
    let uris = uriList.reduce((acc, curr) => acc.concat(curr), [])
    return uris
  }

  public async findModules(): Promise<vscode.Uri[]> {
    if (!this.slangConfig.indexGlobs) {
      this.logger.warn('No index globs found in config')
      return []
    }
    this.logger.warn('Indexing with slang globs ' + this.slangConfig.indexGlobs)
    return await this.findFiles(this.slangConfig.indexGlobs)
  }
}

export async function deactivate(): Promise<void> {
  await ext.stopServer()
  ext.logger.info('Deactivated')
}

export async function activate(context: vscode.ExtensionContext) {
  ext = new VerilogExtension(context, {
    id: 'slang',
    title: 'Slang',
    icon: '$(chip)',
  })
  await ext.activateExtension('slang', 'Slang', context, [
    // 'andrewnolte.vscode-system-verilog',
    'mshr-h.veriloghdl',
    'eirikpre.systemverilog',
    'IMCTradingBV.svlangserver',
  ])
}

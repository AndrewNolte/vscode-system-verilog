// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'

import { CommandExcecutor } from './commands/ModuleInstantiation'
import { CtagsComponent } from './CtagsComponent'
import LintManager from './linter/LintManager'
import * as CompletionItemProvider from './providers/CompletionItemProvider'
import * as DefinitionProvider from './providers/DefinitionProvider'
import * as DocumentSymbolProvider from './providers/DocumentSymbolProvider'
import * as HoverProvider from './providers/HoverProvider'
import { ExtensionComponent, ConfigObject } from './lib/libconfig'
import { SystemVerilogFormatProvider, VerilogFormatProvider } from './providers/FormatProvider'
import { LanguageServerComponent } from './LSComponent'
import { readFile, writeFile } from 'fs/promises'
import { IndexComponent } from './IndexComponent'
import { getWorkspaceFolder } from './utils'

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

export class VerilogExtension extends ExtensionComponent {
  index: IndexComponent = new IndexComponent()
  ctags: CtagsComponent = new CtagsComponent()
  includes: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Include paths to pass as -I to tools',
  })

  moduleGlobs: ConfigObject<string[]> = new ConfigObject({
    default: ['**/*.{sv,v}'],
    description:
      'Globs for finding verilog modules, interfaces, and packages for use with the common -y flag',
  })
  includeGlobs: ConfigObject<string[]> = new ConfigObject({
    default: ['**/*.{svh}'],
    description:
      'Globs for finding verilog include files (typically svh), used for definition providing. If set to [], it will source from verilog.includes',
  })
  excludeGlob: ConfigObject<string> = new ConfigObject({
    default: '',
    description: 'Globs to exclude files',
  })

  lint: LintManager = new LintManager()

  svFormat: SystemVerilogFormatProvider = new SystemVerilogFormatProvider()
  verilogFormat: VerilogFormatProvider = new VerilogFormatProvider()
  svStandard: ConfigObject<SvStandard> = new ConfigObject({
    default: SvStandard.SV2017,
    description: 'System Verilog standard to use',
    type: 'enum',
    enum: Object.values(SvStandard),
  })
  verilogStandard: ConfigObject<VerilogStandard> = new ConfigObject({
    default: VerilogStandard.V2005,
    description: 'System Verilog standard to use',
    type: 'enum',
    enum: Object.values(VerilogStandard),
  })
  formatDirs: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Directories to format',
  })

  languageServer: LanguageServerComponent = new LanguageServerComponent()

  extensionID: string = 'AndrewNolte.vscode-system-verilog'

  async activate(context: vscode.ExtensionContext) {
    // Lets do this quickly
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint.lint(editor.document)
    })

    /////////////////////////////////////////////
    // Configure Providers
    /////////////////////////////////////////////

    let verilogDocumentSymbolProvider = new DocumentSymbolProvider.VerilogDocumentSymbolProvider(
      this.logger.getChild('VerilogDocumentSymbolProvider')
    )

    let verilogCompletionItemProvider = new CompletionItemProvider.VerilogCompletionItemProvider(
      this.logger.getChild('VerilogCompletionItemProvider')
    )

    let verilogHoverProvider = new HoverProvider.VerilogHoverProvider(
      this.logger.getChild('VerilogHoverProvider')
    )

    let verilogDefinitionProvider = new DefinitionProvider.VerilogDefinitionProvider(
      this.logger.getChild('VerilogDefinitionProvider')
    )

    // push provider subs to .v and .sv files
    const selectors = [
      { scheme: 'file', language: 'verilog' },
      { scheme: 'file', language: 'systemverilog' },
    ]
    selectors.forEach((selector) => {
      context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(selector, verilogDocumentSymbolProvider)
      )

      context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
          selector,
          verilogCompletionItemProvider,
          '.',
          '(',
          '='
        )
      )

      context.subscriptions.push(
        vscode.languages.registerHoverProvider(selector, verilogHoverProvider)
      )

      context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, verilogDefinitionProvider)
      )
    })

    /////////////////////////////////////////////
    // Configure Format on save
    /////////////////////////////////////////////

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
        if (document.languageId === 'systemverilog' || document.languageId === 'verilog') {
          let dirs: string[] = this.formatDirs.getValue() ?? []
          for (let dir of dirs) {
            if (vscode.workspace.asRelativePath(document.uri.fsPath).startsWith(dir)) {
              this.logger.info('Formatting on save due to directory ' + dir)
              await vscode.commands.executeCommand('editor.action.formatDocument')
              await document.save()
              return
            }
          }
        }
      })
    )

    /////////////////////////////////////////////
    // Register Commands
    /////////////////////////////////////////////

    let commandExcecutor = new CommandExcecutor(this.logger.getChild('CommandExcecutor'))
    vscode.commands.registerCommand(
      'verilog.instantiateModule',
      commandExcecutor.instantiateModuleInteract,
      commandExcecutor
    )
    vscode.commands.registerCommand('verilog.lint', this.lint.runLintTool, this.lint)

    // dev commands
    if (context.extensionMode !== vscode.ExtensionMode.Production) {
      vscode.commands.registerCommand('verilog.dev.updateConfig', async () => {
        // update package.json
        {
          let filePath = context.extensionPath + '/package.json'
          const data = await readFile(filePath, { encoding: 'utf-8' })
          let json = JSON.parse(data)
          json.contributes.configuration.properties = ext.getConfigJson()
          const updatedJson = JSON.stringify(json, null, 2)
          await writeFile(filePath, updatedJson, { encoding: 'utf-8' })
        }

        // update config.md
        {
          let filePath = context.extensionPath + '/CONFIG.md'
          await writeFile(filePath, ext.getConfigMd(), { encoding: 'utf-8' })
        }
      })
    }

    ///////////////////////////////////////////
    // Slow async tasks
    /////////////////////////////////////////////

    // let ctags index include files
    await this.indexFiles()
    vscode.commands.registerCommand('verilog.reindex', async () => {
      await this.indexFiles(true)
    })

    this.logger.info(`${context.extension.id} activation finished.`)
  }

  private async indexFiles(reset: boolean = false) {
    if (!(await this.ctags.path.checkPathNotify())) {
      return
    }

    this.ctags.indexIncludes(reset).then(() => {
      this.logger.info('ctags index includes finished')
    })

    // index all files (symlinks in .sv_cache/files + in memory cache)
    this.index
      .indexFiles(reset)
      .then(() => {
        this.logger.info('index files finished')
      })
      .catch((err) => {
        this.logger.error('index files failed:')
        this.logger.error(err)
      })
  }

  public async findFiles(globs: string[]): Promise<vscode.Uri[]> {
    let ws = getWorkspaceFolder()
    if (ws === undefined) {
      return []
    }
    const exclude: string = this.excludeGlob.getValue()

    const find = async (str: string): Promise<vscode.Uri[]> => {
      let searchPattern = new vscode.RelativePattern(ws, str)
      let ret = await vscode.workspace.findFiles(searchPattern, exclude)
      return ret
    }
    let uriList: vscode.Uri[][] = await Promise.all(globs.map(find))
    let uris = uriList.reduce((acc, curr) => acc.concat(curr), [])
    return uris
  }

  public async findIncludes(): Promise<vscode.Uri[]> {
    let incGlobs = this.includeGlobs.getValue()
    if (incGlobs.length === 0) {
      incGlobs = this.includes.getValue().map((inc) => {
        return inc + '/*.svh'
      })
    }
    return await this.findFiles(incGlobs)
  }

  public async findModules(): Promise<vscode.Uri[]> {
    return await this.findFiles(this.moduleGlobs.getValue())
  }
}

export function deactivate(): Promise<void> {
  ext.logger.info('Deactivated')
  return ext.languageServer.stopAllLanguageClients()
}

export async function activate(context: vscode.ExtensionContext) {
  ext = new VerilogExtension()
  await ext.activateExtension('verilog', context)
}

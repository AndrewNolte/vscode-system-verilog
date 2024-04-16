// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'

import { CommandExcecutor } from './commands/ModuleInstantiation'
import { CtagsManager } from './ctags'
import { ExtensionManager } from './extensionManager'
import LintManager from './linter/LintManager'
import * as CompletionItemProvider from './providers/CompletionItemProvider'
import * as DefinitionProvider from './providers/DefinitionProvider'
import * as DocumentSymbolProvider from './providers/DocumentSymbolProvider'
import * as HoverProvider from './providers/HoverProvider'
import { ExtensionComponent, ConfigObject } from './libconfig'
import { SystemVerilogFormatProvider, VerilogFormatProvider } from './providers/FormatProvider'
import { LanguageServerManager } from './LSManager'
import { readFile, writeFile } from 'fs/promises'

export var ext: VerilogExtension

export enum SvStandard {
  sv2005 = 'SystemVerilog-2005',
  sv2009 = 'SystemVerilog-2009',
  sv2012 = 'SystemVerilog-2012',
  sv2017 = 'SystemVerilog-2017',
  //   sv2023 = 'SystemVerilog2023',
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum VerilogStandard {
  v1995 = 'Verilog-95',
  v2001 = 'Verilog-2001',
  v2005 = 'Verilog-2005',
}

export class VerilogExtension extends ExtensionComponent {
  ctags: CtagsManager = new CtagsManager()
  includes: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Include Paths for tools',
  })
  directory: ConfigObject<string> = new ConfigObject({
    default: '',
    description: 'The directory containing all hardware files',
  })

  lint: LintManager = new LintManager()

  svFormat: SystemVerilogFormatProvider = new SystemVerilogFormatProvider()
  verilogFormat: VerilogFormatProvider = new VerilogFormatProvider()
  svStandard: ConfigObject<SvStandard> = new ConfigObject({
    default: SvStandard.sv2017,
    description: 'System Verilog standard to use',
    type: 'enum',
    enum: Object.values(SvStandard),
  })
  verilogStandard: ConfigObject<VerilogStandard> = new ConfigObject({
    default: VerilogStandard.v2005,
    description: 'System Verilog standard to use',
    type: 'enum',
    enum: Object.values(VerilogStandard),
  })
  formatDirs: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Directories to format',
  })

  languageServer: LanguageServerManager = new LanguageServerManager()

  extensionID: string = 'AndrewNolte.vscode-system-verilog'

  activate(context: vscode.ExtensionContext) {
    /////////////////////////////////////////////
    // Register Lint Manager, runs selected linters
    /////////////////////////////////////////////

    let extMgr = new ExtensionManager(
      context,
      this.extensionID,
      this.logger.getChild('ExtensionManager')
    )
    if (extMgr.isVersionUpdated()) {
      extMgr.showChangelogNotification()
    }

    /////////////////////////////////////////////
    // Configure Providers
    /////////////////////////////////////////////

    let verilogDocumentSymbolProvider = new DocumentSymbolProvider.VerilogDocumentSymbolProvider(
      this.logger.getChild('VerilogDocumentSymbolProvider'),
      this.ctags
    )

    let verilogCompletionItemProvider = new CompletionItemProvider.VerilogCompletionItemProvider(
      this.logger.getChild('VerilogCompletionItemProvider'),
      this.ctags
    )

    let verilogHoverProvider = new HoverProvider.VerilogHoverProvider(
      this.logger.getChild('VerilogHoverProvider'),
      this.ctags
    )

    let verilogDefinitionProvider = new DefinitionProvider.VerilogDefinitionProvider(
      this.logger.getChild('VerilogDefinitionProvider'),
      this.ctags
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

    // lint all open now that ctags is done
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint.lint(editor.document)
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

    let commandExcecutor = new CommandExcecutor(
      this.logger.getChild('CommandExcecutor'),
      this.ctags
    )
    vscode.commands.registerCommand(
      'verilog.instantiateModule',
      commandExcecutor.instantiateModuleInteract,
      commandExcecutor
    )
    vscode.commands.registerCommand('verilog.lint', this.lint.runLintTool, this.lint)

    vscode.commands.registerCommand('verilog.dev.dumpConfig', async () => {
      // select workspace folder
      let fileUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        openLabel: 'Workspace folder for the extension',
      })
      if (fileUri === undefined) {
        throw Error('fileuri undefined')
      }

      // update package.json
      {
        let filePath = fileUri[0].fsPath + '/package.json'
        const data = await readFile(filePath, { encoding: 'utf-8' })
        let json = JSON.parse(data)
        json.contributes.configuration.properties = ext.getConfigJson()
        const updatedJson = JSON.stringify(json, null, 2)
        await writeFile(filePath, updatedJson, { encoding: 'utf-8' })
      }

      // update config.md
      {
        let filePath = fileUri[0].fsPath + '/CONFIG.md'
        await writeFile(filePath, ext.getConfigMd(), { encoding: 'utf-8' })
      }
    })

    this.logger.info(this.extensionID + ' activation finished.')
  }
}

export function deactivate(): Promise<void> {
  ext.logger.info('Deactivated')
  return ext.languageServer.stopAllLanguageClients()
}

export function activate(context: vscode.ExtensionContext) {
  ext = new VerilogExtension()
  ext.activateExtension('verilog', context)
}

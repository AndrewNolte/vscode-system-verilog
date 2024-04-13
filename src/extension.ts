// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node'

import { CommandExcecutor } from './commands/ModuleInstantiation'
import { CtagsManager } from './ctags'
import { ExtensionManager } from './extensionManager'
import LintManager from './linter/LintManager'
import { createLogger, Logger } from './logger'
import * as CompletionItemProvider from './providers/CompletionItemProvider'
import * as DefinitionProvider from './providers/DefinitionProvider'
import * as DocumentSymbolProvider from './providers/DocumentSymbolProvider'
import * as HoverProvider from './providers/HoverProvider'
import { ExtensionComponent, ConfigObject } from './libconfig'
import { SystemVerilogFormatProvider, VerilogFormatProvider } from './providers/FormatPrivider'
import { LanguageServerManager } from './LSManager'

export var config: VerilogExtension // Global config

export enum SvStandard {
  sv2005 = 'SystemVerilog-2005',
  sv2009 = 'SystemVerilog-2009',
  sv2012 = 'SystemVerilog-2012',
  //   sv2017 = 'SystemVerilog2017',
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
    // need to lint open files before ctags opens up documents
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(this.lint.lint, this.lint))
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.lint.lint, this.lint))
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(this.lint.removeFileDiagnostics, this.lint)
    )

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

    /////////////////////////////////////////////
    // Configure Formatters
    /////////////////////////////////////////////

    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'verilog' },
        this.verilogFormat
      )
    )
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'systemverilog' },
        this.svFormat
      )
    )
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
        if (document.languageId === 'systemverilog' || document.languageId === 'verilog') {
          let dirs: string[] = this.formatDirs.getValue() ?? []
          for (let dir of dirs) {
            if (vscode.workspace.asRelativePath(document.uri.fsPath).startsWith(dir)) {
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

    vscode.commands.registerCommand('verilog.dev.dumpConfig', () => {
      vscode.workspace.openTextDocument({
        content: JSON.stringify(config.getConfigJson(), null, 2),
        language: 'json',
      })
    })

    /////////////////////////////////////////////
    // Language Servers
    /////////////////////////////////////////////

    this.logger.info(this.extensionID + ' activation finished.')
  }
}

export function deactivate(): Promise<void> {
  config.logger.info('Deactivated')
  return config.languageServer.stopAllLanguageClients()
}

export function activate(context: vscode.ExtensionContext) {
  config = new VerilogExtension()
  config.activateExtension('verilog', context)
}

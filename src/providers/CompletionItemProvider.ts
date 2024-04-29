// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { Logger } from '../lib/logger'
import { Symbol } from '../parsers/ctagsParser'
import { ext } from '../extension'
import { getPrev2Char } from '../utils'

export class VerilogCompletionItemProvider implements vscode.CompletionItemProvider {
  private logger: Logger
  constructor(logger: Logger) {
    this.logger = logger
  }

  async provideModuleCompletion(
    document: vscode.TextDocument,
    _position: vscode.Position, // module_name #(
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    this.logger.info('Module Completion requested')
    let items: vscode.CompletionItem[] = []

    let moduleRange = document.getWordRangeAtPosition(_position.translate(0, -3))
    let moduleName = document.getText(moduleRange)

    let moduleDoc = await ext.index.findModule(moduleName)
    if (moduleDoc === undefined) {
      return []
    }

    let ctags = ext.ctags.getCtags(moduleDoc)
    let modules = await ctags.getModules()
    if (modules.length === 0) {
      return []
    }
    let module = modules[0]
    let newItem: vscode.CompletionItem = new vscode.CompletionItem(
      module.getHoverText(),
      vscode.CompletionItemKind.Module
    )
    newItem.insertText = ctags.getModuleSnippet(module, false)
    items.push(newItem)

    return items
  }

  //TODO: Better context based completion items
  async provideCompletionItems(
    document: vscode.TextDocument,
    _position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    this.logger.info('providing completion on ' + context.triggerCharacter)
    if (context.triggerCharacter === '(') {
      // if the prev char is #
      let textBeforePosition = document.getText(
        new vscode.Range(new vscode.Position(_position.line, 0), _position.translate(0, -1))
      )
      // Check if the last character is #f
      if (textBeforePosition.endsWith('#')) {
        this.logger.info('trigging module inst')

        return await this.provideModuleCompletion(document, _position, _token, context)
      }
    }

    let ppChar = getPrev2Char(document, _position)

    let symbols: Symbol[] = []

    if (context.triggerCharacter === ':' && ppChar === ':') {
      let pkgRange = document.getWordRangeAtPosition(_position.translate(0, -2))
      let pkgName = document.getText(pkgRange)
      let ctags = await ext.ctags.findModule(pkgName)
      if (ctags === undefined) {
        return []
      }
      symbols = await ctags.getPackageSymbols()
    } else {
      symbols = await ext.ctags.getCtags(document).getSymbols()
    }

    let items = symbols.map((symbol: Symbol) => {
      return symbol.getCompletionItem()
    })

    this.logger.info(`Returning ${items.length} completion items`)
    return items
  }
}

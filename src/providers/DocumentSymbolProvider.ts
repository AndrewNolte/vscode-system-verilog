// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { Logger } from '../lib/logger'
import { ext } from '../extension'

export class VerilogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  private logger: Logger
  constructor(logger: Logger) {
    this.logger = logger
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    this.logger.info('[VerilogSymbol] Symbols Requested: ' + document.uri)
    let docSymbols = (await ext.ctags.getCtags(document).getSymbolTree()).map((sym) =>
      sym.getDocumentSymbol()
    )
    this.logger.info(docSymbols.length + ' top-level symbols returned')
    return docSymbols
  }
}

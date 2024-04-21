// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { Logger } from '../logger'
import { Symbol } from '../parsers/ctagsParser'
import { ext } from '../extension'

export class VerilogDefinitionProvider implements vscode.DefinitionProvider {
  private logger: Logger
  constructor(logger: Logger) {
    this.logger = logger
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.DefinitionLink[] | undefined> {
    this.logger.info('Definitions Requested: ' + document.uri)
    // find all matching symbols
    let syms: Symbol[] = await ext.ctags.findSymbol(document, position)
    this.logger.info(syms.length + ' definitions returned')
    return syms.map((sym) => sym.getDefinitionLink())
  }
}

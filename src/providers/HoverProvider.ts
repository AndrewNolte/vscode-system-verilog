// SPDX-License-Identifier: MIT
// import * as vscode from 'vscode';
import * as vscode from 'vscode'
import { CtagsManager } from '../ctags'
import { Logger } from '../logger'
import { Symbol } from '../parsers/ctagsParser'

export class VerilogHoverProvider implements vscode.HoverProvider {
  // lang: verilog / systemverilog
  private logger: Logger
  private ctagsManager: CtagsManager
  constructor(logger: Logger, ctagsManager: CtagsManager) {
    this.logger = logger
    this.ctagsManager = ctagsManager
  }

  // end position in line
  getWordRanges(
    doc: vscode.TextDocument,
    endpos: vscode.Position
    // token: vscode.CancellationToken
  ): vscode.Range[] {
    let line = endpos.line
    let pos = new vscode.Position(line, 0)
    let ranges = []
    while (pos.character < endpos.character) {
      // let hover = await this.provideHover(doc, new vscode.Position(pos.line, x), token);
      let range = doc.getWordRangeAtPosition(pos)
      if (range !== undefined) {
        ranges.push(range)
        pos = range.end.translate(0, 1)
      } else {
        pos = pos.translate(0, 1)
      }
      pos = pos.translate(0, pos.character + 1)
    }

    return ranges
  }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    this.logger.info('Hover requested')
    let syms: Symbol[] = await this.ctagsManager.findSymbol(document, position)
    if (syms.length === 0) {
      this.logger.warn('Hover object not found')
      return undefined
    }

    let sym = syms[0]
    let ctags = this.ctagsManager.getCtags(sym.doc)
    let hovers = await ctags.getNestedHoverText(sym)
    // let hovers = await syms[0].getHoverTextRecursive(this.ctagsManager, 1);
    let mds = hovers.reverse().map((hover) => {
      let md = new vscode.MarkdownString()
      md.appendCodeblock(hover, document.languageId)
      return md
    })
    this.logger.info('Hover object returned')
    return new vscode.Hover(mds)
  }
}

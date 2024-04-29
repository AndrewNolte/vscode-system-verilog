// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { Logger } from '../lib/logger'
import { Symbol } from '../parsers/ctagsParser'
import { ext } from '../extension'
import { getPrevChar } from '../utils'

import { readFile } from 'fs/promises'
export class VerilogDefinitionProvider implements vscode.HoverProvider, vscode.DefinitionProvider {
  private logger: Logger
  private builtins: any = undefined
  constructor(logger: Logger) {
    this.logger = logger
  }

  async loadBuiltins(ctx: vscode.ExtensionContext) {
    // this.builtins = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'builtins.json'), 'utf8'))
    let filePath = ctx.extensionPath + '/src/builtins.json'
    const data = await readFile(filePath, { encoding: 'utf-8' })
    this.builtins = JSON.parse(data)
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

  private provideHoverBuiltin(
    document: vscode.TextDocument,
    range: vscode.Range
  ): vscode.Hover | undefined {
    this.logger.info('Hover builtin requested')

    let word = document.getText(range)
    if (this.builtins[word] === undefined) {
      return undefined
    }

    let md = new vscode.MarkdownString()

    let desc = this.builtins[word].description.split('. ').join('.\n')
    md.appendText(desc)

    let args = this.builtins[word].args
    let arglist = []
    for (let name in args) {
      arglist.push(args[name].type + ' ' + name)
    }
    md.appendCodeblock(`$${word}(${arglist.join(', ')})`, document.languageId)

    return new vscode.Hover(md)
  }

  public async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): Promise<vscode.Hover | undefined> {
    this.logger.info('Hover requested')

    // TODO: reuse this range, pass to findSymbol
    let range = document.getWordRangeAtPosition(position)
    if (range === undefined) {
      return undefined
    }

    // handle builtin
    let pchar = getPrevChar(document, range)
    if (pchar === '$' && this.builtins !== undefined) {
      return this.provideHoverBuiltin(document, range)
    }

    let syms: Symbol[] = await ext.ctags.findSymbol(document, position)
    if (syms.length === 0) {
      this.logger.warn('Hover object not found')
      return undefined
    }

    let sym = syms[0]
    let ctags = ext.ctags.getCtags(sym.doc)

    let hovers = await ctags.getNestedHoverText(sym)
    let mds = hovers.reverse().map((hover) => {
      let md = new vscode.MarkdownString()
      md.appendCodeblock(hover, document.languageId)
      return md
    })
    this.logger.info('Hover object returned')
    return new vscode.Hover(mds)
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

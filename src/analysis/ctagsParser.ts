import * as child_process from 'child_process'
import * as vscode from 'vscode'
import { ext } from '../extension'
import { Logger } from '../lib/logger'

export class Symbol {
  name: string
  type: string
  line: number
  // range of identifier
  idRange: vscode.Range | undefined
  startPosition: vscode.Position
  // range of whole object (type, begin/end, etc.)
  fullRange: vscode.Range | undefined
  parentScope: string
  parentType: string
  isValid: boolean
  typeRef: string | null
  doc: vscode.TextDocument
  children: Symbol[]
  constructor(
    doc: vscode.TextDocument,
    name: string,
    type: string,
    startLine: number,
    parentScope: string,
    parentType: string,
    typeRef: string | null,
    isValid?: boolean
  ) {
    this.doc = doc
    this.name = name
    this.type = type
    this.line = startLine
    this.startPosition = new vscode.Position(startLine, 0)
    this.parentScope = parentScope
    this.parentType = parentType
    this.isValid = Boolean(isValid)
    this.typeRef = typeRef
    this.children = []
  }

  prettyPrint(): string {
    let ret = `${this.name}(${this.type}):${this.line}`
    if (this.parentScope !== '') {
      ret += ` parent=${this.parentScope}(${this.parentType})`
    }
    if (this.typeRef !== null) {
      ret += ` typeref=${this.typeRef}`
    }
    return ret
  }

  hasInstanceChildren(): boolean {
    if (this.children.filter((child) => child.type === 'instance').length > 0) {
      return true
    }
    // return true if any block children have instance children
    return this.children
      .filter((child) => child.type === 'block')
      .some((child) => {
        return child.hasInstanceChildren()
      })
  }

  getIdRange(): vscode.Range {
    if (this.idRange === undefined) {
      this.idRange = this.doc.getWordRangeAtPosition(
        new vscode.Position(this.line, this.doc.lineAt(this.line).text.indexOf(this.name))
      )
      if (this.idRange === undefined) {
        this.idRange = this.getFullRange()
      }
    }
    return this.idRange
  }

  getFullRange(): vscode.Range {
    if (this.fullRange !== undefined) {
      return this.fullRange
    }

    if (this.type === 'typedef') {
      let sOffset = this.doc.offsetAt(this.getIdRange().start)
      const index = this.doc.getText().lastIndexOf('typedef', sOffset)
      if (index >= 0) {
        let pos = this.doc.positionAt(index)
        this.fullRange = new vscode.Range(pos, this.getIdRange().end)
      }
    } else if (this.type === 'instance') {
      let idind = this.doc.offsetAt(this.getIdRange().start)
      let endind = this.doc.getText().indexOf(';', idind)
      let startind: number
      if (this.typeRef === null) {
        startind = idind
      } else {
        startind = this.doc.getText().lastIndexOf(this.typeRef, idind)
      }

      if (startind >= 0 && endind >= 0) {
        this.fullRange = new vscode.Range(
          this.doc.positionAt(startind),
          this.doc.positionAt(endind)
        )
      }
    } else if (this.isMacro()) {
      let firstchar = this.doc.lineAt(this.line).firstNonWhitespaceCharacterIndex
      let spos = new vscode.Position(this.line, firstchar)
      let endline = this.line
      for (; endline < this.doc.lineCount; endline++) {
        if (!this.doc.lineAt(endline).text.endsWith('\\')) {
          break
        }
      }
      this.fullRange = new vscode.Range(spos, new vscode.Position(endline, Number.MAX_VALUE))
    }

    if (this.fullRange === undefined) {
      this.fullRange = this.doc.lineAt(this.line).range
    }

    return this.fullRange
  }

  getUnindented(): string {
    let range = this.getFullRange()
    let leadingSpaces = this.doc.lineAt(range.start.line).text.match(/^ */)?.[0].length ?? 0

    let outline = []
    for (let line = range.start.line; line <= range.end.line; line++) {
      outline.push(this.doc.lineAt(line).text.substring(leadingSpaces))
    }
    return outline.join('\n')
  }

  setEndPosition(endLine: number) {
    this.fullRange = new vscode.Range(this.line, 0, endLine, Number.MAX_VALUE)
    this.isValid = true
  }

  getDocumentSymbol(): vscode.DocumentSymbol {
    let sym = new vscode.DocumentSymbol(
      this.name,
      this.type,
      this.getSymbolKind(),
      this.fullRange ?? this.getIdRange(),
      this.getIdRange()
    )
    sym.children = this.children.map((child) => child.getDocumentSymbol())
    return sym
  }

  isMacro(): boolean {
    if (this.type === 'define') {
      return true
    }
    // < 6.1
    if (this.type !== 'constant') {
      return false
    }

    let charnum = this.getIdRange().start.character
    if (charnum === undefined) {
      return false
    }
    let firstchar = this.doc.lineAt(this.line).firstNonWhitespaceCharacterIndex
    if (
      this.doc.getText(new vscode.Range(this.line, firstchar, this.line, firstchar + 7)) ===
      '`define'
    ) {
      return true
    }
    return false
  }

  isModuleType(): boolean {
    return this.type === 'module' || this.type === 'interface'
  }

  getHoverText(): string {
    if (this.type === 'typedef' || this.type === 'instance' || this.isMacro()) {
      return this.getUnindented()
    }

    let code = this.doc
      .lineAt(this.line)
      .text.trim()
      .replace(/\s{2,}/g, ' ') // trim long whitespace from formatting
      .replace(/,$/, '') // remove trailing commas
      .replace(/#\($/, '') // remove trailing #(
      .trim()
    return code
  }

  getDefinitionLink(): vscode.DefinitionLink {
    return {
      targetUri: this.doc.uri,
      targetRange: this.getIdRange(),
      targetSelectionRange: this.fullRange,
    }
  }

  static isContainer(type: string): boolean {
    switch (type) {
      case 'constant':
      case 'parameter':
      case 'event':
      case 'net':
      case 'port':
      case 'register':
      case 'modport':
      case 'prototype':
      case 'typedef':
      case 'property':
      case 'assert':
        return false
      case 'function':
      case 'module':
      case 'task':
      case 'block':
      case 'class':
      case 'covergroup':
      case 'enum':
      case 'interface':
      case 'package':
      case 'program':
      case 'struct':
        return true
    }
    return false
  }

  isData(): boolean {
    switch (this.type) {
      case 'parameter':
      case 'constant': // localparam
      case 'register':
      case 'port':
      case 'wire':
        return true
      default:
        return false
    }
  }

  isConstant(): boolean {
    switch (this.type) {
      case 'parameter':
      case 'constant': // localparam
        return true
      default:
        return false
    }
  }

  // types used by ctags
  // taken from https://github.com/universal-ctags/ctags/blob/master/parsers/verilog.c
  // Vscode icons at https://code.visualstudio.com/api/references/icons-in-labels
  getSymbolKind(): vscode.SymbolKind {
    switch (this.type) {
      case 'constant':
        return vscode.SymbolKind.Constant
      case 'parameter':
        return vscode.SymbolKind.TypeParameter
      case 'event':
        return vscode.SymbolKind.Event
      case 'function':
        return vscode.SymbolKind.Function
      case 'module':
        return vscode.SymbolKind.Module
      case 'net':
        return vscode.SymbolKind.Variable
      // Boolean uses a double headed arrow as symbol (kinda looks like a port)
      case 'port':
        return vscode.SymbolKind.Boolean
      case 'register':
        return vscode.SymbolKind.Variable
      case 'task':
        return vscode.SymbolKind.Function
      case 'block':
        return vscode.SymbolKind.Module
      case 'assert':
        return vscode.SymbolKind.Variable // No idea what to use
      case 'class':
        return vscode.SymbolKind.Module
      case 'covergroup':
        return vscode.SymbolKind.Class // No idea what to use
      case 'enum':
        return vscode.SymbolKind.Enum
      case 'interface':
        return vscode.SymbolKind.Interface
      case 'modport':
        return vscode.SymbolKind.Property // same as ports
      case 'package':
        return vscode.SymbolKind.Package
      case 'program':
        return vscode.SymbolKind.Module
      case 'prototype':
        return vscode.SymbolKind.Function
      case 'property':
        return vscode.SymbolKind.Property // Not sure this is used
      case 'struct':
        return vscode.SymbolKind.Struct
      case 'typedef':
        return vscode.SymbolKind.Struct
      case 'instance':
        return vscode.SymbolKind.Class
      default:
        return vscode.SymbolKind.Variable
    }
  }

  public getCompletionItem(): vscode.CompletionItem {
    let item: vscode.CompletionItem = new vscode.CompletionItem(
      this.name,
      this.getCompletionItemKind()
    )
    item.detail = this.type
    item.filterText = this.name
    if (this.isMacro()) {
      let ln = this.doc.lineAt(this.line).text
      let args = ln.substring(ln.indexOf('(') + 1, ln.indexOf(')'))

      let snip = new vscode.SnippetString(this.name + '(')
      let arglist = args.split(',')
      for (let i = 0; i < arglist.length; i++) {
        snip.appendPlaceholder(arglist[i].trim())
        if (i !== arglist.length - 1) {
          snip.appendText(', ')
        }
      }
      snip.appendText(')')
      let txt = ln.substring(this.getIdRange().start.character, ln.indexOf(')') + 1)
      // let ins = new vscode.SnippetString()
      item.insertText = snip
      item.documentation = txt
      item.label = '`' + item.label
    } else {
      item.insertText = this.name
      item.documentation = this.getHoverText()
    }
    return item
  }

  public getCompletionItemKind(): vscode.CompletionItemKind {
    switch (this.type) {
      case 'constant':
        return vscode.CompletionItemKind.Constant
      case 'parameter':
        return vscode.CompletionItemKind.TypeParameter
      case 'event':
        return vscode.CompletionItemKind.Event
      case 'function':
        return vscode.CompletionItemKind.Function
      case 'module':
        return vscode.CompletionItemKind.Module
      case 'net':
        return vscode.CompletionItemKind.Variable
      case 'port':
        return vscode.CompletionItemKind.Interface // No bool, this looks similar
      case 'register':
        return vscode.CompletionItemKind.Variable
      case 'task':
        return vscode.CompletionItemKind.Function
      case 'block':
        return vscode.CompletionItemKind.Module
      case 'assert':
        return vscode.CompletionItemKind.Variable // No idea what to use
      case 'class':
        return vscode.CompletionItemKind.Class
      case 'covergroup':
        return vscode.CompletionItemKind.Class // No idea what to use
      case 'enum':
        return vscode.CompletionItemKind.Enum
      case 'interface':
        return vscode.CompletionItemKind.Interface
      case 'modport':
        return vscode.CompletionItemKind.Variable // same as ports
      case 'package':
        return vscode.CompletionItemKind.Module
      case 'program':
        return vscode.CompletionItemKind.Module
      case 'prototype':
        return vscode.CompletionItemKind.Function
      case 'property':
        return vscode.CompletionItemKind.Property
      case 'struct':
        return vscode.CompletionItemKind.Struct
      case 'typedef':
        return vscode.CompletionItemKind.Struct
      case 'instance':
        return vscode.CompletionItemKind.Class
      default:
        return vscode.CompletionItemKind.Variable
    }
  }
}

// select one
interface SymbolFilter {
  name?: string
  type?: string
}

function filterSymbols(symbols: Symbol[], filter: SymbolFilter): Symbol[] {
  if (filter.type !== undefined) {
    symbols = symbols.filter((sym) => sym.type === filter.type)
  }
  if (filter.name !== undefined) {
    symbols = symbols.filter((sym) => sym.name === filter.name)
  }
  return symbols
}

// TODO: add a user setting to enable/disable all ctags based operations
export class CtagsParser {
  /// Symbol definitions (no rhs)
  symbols: Symbol[]
  topSymbols: Symbol[]
  doc: vscode.TextDocument
  isDirty: boolean
  private logger: Logger

  constructor(logger: Logger, document: vscode.TextDocument) {
    this.symbols = []
    this.topSymbols = []
    this.isDirty = true
    this.logger = logger
    this.doc = document
    ext.ctags.path.listen()
  }

  clearSymbols() {
    this.isDirty = true
  }

  async getSymbols(filter: SymbolFilter = {}, addImports = true): Promise<Symbol[]> {
    if (this.isDirty) {
      this.logger.info('indexing ', this.doc.uri.fsPath)
      this.clearSymbols()
      // parse raw symbols
      let output = await this.execCtags(this.doc.uri.fsPath)
      await this.buildSymbolsList(output)

      // TODO: make this parallel, need to make buildSymbolsList functional
      if (addImports) {
        let addSymbols = await this.parseImports()
        this.symbols.push(...addSymbols)
      }
    }
    return filterSymbols(this.symbols, filter)
  }

  async parseImports(): Promise<Symbol[]> {
    // search for import pkg::*;
    let importedFiles: vscode.Uri[] = []
    const importRe = /[^\w]import ([^:]+)::\*;/g
    const text = this.doc.getText()
    let match
    while ((match = importRe.exec(text)) !== null) {
      const uri = ext.index.moduleMap.get(match[1])
      if (uri !== undefined) {
        importedFiles.push(uri)
      }
    }

    // TODO: maybe do includes? The thing is includes are recommended to be preindexed (svh),
    // so the parsing here would not really be needed
    // const includeRe = new RegExp(/^\s*`include "([^"]+)"/g)

    // parse each import in parallel
    const symbols: Promise<Symbol[]>[] = importedFiles.map(async (uri) => {
      let doc = await vscode.workspace.openTextDocument(uri)
      const ctags = ext.ctags.getCtags(doc)
      return ctags.getSymbols()
    })

    return (await Promise.all(symbols)).reduce((acc, curr) => acc.concat(curr), [])
  }

  async getModules(): Promise<Symbol[]> {
    let syms = await this.getSymbols()
    return syms.filter((tag) => tag.type === 'module' || tag.type === 'interface')
  }

  async getInstances(): Promise<Symbol[]> {
    return await this.getSymbols({ type: 'instance' })
  }

  async getPackageSymbols(): Promise<Symbol[]> {
    let syms = await this.getSymbols({}, false)
    return syms.filter(
      (tag) => tag.type !== 'member' && tag.type !== 'register' && tag.type !== 'port'
    )
  }

  async execCtags(filepath: string): Promise<string> {
    let command: string = await ext.ctags.path.getValueAsync()
    let args: string[] =
      '-f - --fields=+K --sort=no --excmd=n --fields-SystemVerilog=+{parameter}'.split(' ')
    args.push(filepath)
    // this.logger.info('executing ctags: ' + command + ' ' + args.join(' '))
    return new Promise((resolve, _reject) => {
      child_process.execFile(
        command,
        args,
        { encoding: 'utf-8' },
        (_error, stdout: string, _stderr: string) => {
          resolve(stdout)
        }
      )
    })
  }

  parseTagLine(line: string): Symbol | undefined {
    try {
      let name, type, pattern, lineNoStr, parentScope, parentType: string
      let typeref: string | null = null
      let scope: string[]
      let lineNo: number
      let parts: string[] = line.split('\t')
      name = parts[0]
      type = parts[3]
      // override "type" for parameters (See #102)
      if (parts.length === 6) {
        if (parts[5] === 'parameter:') {
          type = 'parameter'
        }

        if (parts[5].startsWith('typeref')) {
          typeref = parts[5].split(':')[2]
        }
      }
      if (parts.length >= 5) {
        scope = parts[4].split(':')
        parentType = scope[0]
        parentScope = scope[1]
      } else {
        parentScope = ''
        parentType = ''
      }
      lineNoStr = parts[2]
      lineNo = Number(lineNoStr.slice(0, -2)) - 1
      // pretty print symbol
      return new Symbol(this.doc, name, type, lineNo, parentScope, parentType, typeref, false)
    } catch (e) {
      this.logger.error('Line Parser: ' + e)
      this.logger.error('Line: ' + line)
    }
    return undefined
  }

  async buildSymbolsList(tags: string): Promise<void> {
    try {
      if (this.isDirty) {
        this.logger.info('building symbols for ' + this.doc.uri.fsPath)
        if (tags === '') {
          this.logger.error('No output from ctags')
          return
        }
        // Parse ctags output into symbols

        {
          this.symbols = []
          let lines: string[] = tags.split(/\r?\n/)
          lines.forEach((line) => {
            if (line !== '') {
              let sym = this.parseTagLine(line)
              if (sym !== undefined) {
                this.symbols.push(sym)
              }
            }
          })
        }

        {
          // end tags are not supported yet in ctags. So, using regex
          let match: RegExpExecArray | null = null
          let endPosition: vscode.Position
          let text = this.doc.getText()
          let eRegex: RegExp = /^(?![\r\n])\s*end(\w*)*[\s:]?/gm
          while ((match = eRegex.exec(text))) {
            if (match === null) {
              break
            }
            if (typeof match[1] === 'undefined') {
              continue
            }

            endPosition = this.doc.positionAt(match.index + match[0].length - 1)
            let type: string = match[1]
            // get the starting symbols of the same type
            // doesn't check for begin...end blocks
            let s = this.symbols.filter((sym) => {
              return sym.type === type && sym.startPosition.isBefore(endPosition) && !sym.isValid
            })
            if (s.length === 0) {
              continue
            }
            // get the symbol nearest to the end tag
            let max: Symbol = s.reduce(
              (max, current) =>
                current.getIdRange().start.isAfter(max.startPosition) ? current : max,
              s[0]
            )
            max.setEndPosition(endPosition.line)
          }
        }

        {
          // Build symbol tree
          this.topSymbols = []
          let symMap = new Map<string, Symbol>()
          for (let sym of this.symbols) {
            if (sym.parentScope !== '') {
              symMap.set(sym.parentScope + '.' + sym.name, sym)
              let parent = symMap.get(sym.parentScope)
              if (parent !== undefined) {
                parent.children.push(sym)
              } else {
                this.logger.warn('Parent not found for ' + sym.name + ' ' + sym.parentScope)
              }
            } else {
              symMap.set(sym.name, sym)
              this.topSymbols.push(sym)
            }
          }
        }

        this.isDirty = false
      }
    } catch (e) {
      this.logger.error((e as Error).toString())
    }
    // print all syms
    // this.symbols.forEach((sym) => {
    //   this.logger.info(sym.prettyPrint())
    // })
  }

  async getSymbolTree(): Promise<Symbol[]> {
    await this.getSymbols()
    return this.topSymbols
  }

  async getNestedHoverText(sym: Symbol): Promise<Array<string>> {
    // TODO: maybe go deeper
    let ret: string[] = []
    ret.push(sym.getHoverText())
    if (
      sym.isModuleType() ||
      sym.type === 'typedef' ||
      sym.type === 'package' ||
      sym.type === 'instance' ||
      sym.type === 'function' ||
      sym.type === 'class'
    ) {
      // limit depths for certain types
      return ret
    }
    // find other words with definitions in the hover text, and add them
    let range = sym.getFullRange()
    let words = new Set(this.doc.getText(range).match(/\b[a-zA-Z_]\w*\b/g) || [])
    words.delete(sym.name)

    let docsyms = await this.getSymbols()
    let syms = docsyms.filter((sym) => words.has(sym.name))
    let defs = await Promise.all(
      syms.map(async (s: Symbol) => {
        return s.getHoverText()
      })
    )

    if (defs.length > 0) {
      ret.push(defs.join('\n'))
    }

    return ret
  }

  getModuleSnippet(module: Symbol, includeName: boolean = false): vscode.SnippetString {
    let ports: Symbol[] = this.symbols.filter(
      (tag) => tag.type === 'port' && tag.parentScope === module.name
    )
    let params: Symbol[] = this.symbols.filter(
      (tag) => tag.type === 'parameter' && tag.parentScope === module.name
    )

    let s = new vscode.SnippetString()
    if (includeName) {
      s = s.appendText(module.name).appendText(' #')
    }
    s = s.appendText('(')
    if (params.length > 0) {
      s.appendText('\n')
      s = appendPorts(s, params, true)
    }
    s.appendText(') ')
    s = s.appendPlaceholder(`${module.name.toLowerCase()}`).appendText(' (\n')
    s = appendPorts(s, ports, false).appendText(');')
    return s
  }
}

function appendPorts(
  s: vscode.SnippetString,
  ports: Symbol[],
  isParam: boolean
): vscode.SnippetString {
  let maxLen = 0
  for (let i = 0; i < ports.length; i++) {
    if (ports[i].name.length > maxLen) {
      maxLen = ports[i].name.length
    }
  }
  // .NAME(NAME)
  for (let i = 0; i < ports.length; i++) {
    let element = ports[i].name
    let padding = maxLen - element.length
    element = element + ' '.repeat(padding)
    // let match = line.match(/=(.*?)([;,]|\/\/|\))/)

    let endstr = i === ports.length - 1 ? '\n' : ',\n'
    s.appendText(`\t.${element}(`)
    if (isParam) {
      let line = ports[i].doc.lineAt(ports[i].line).text
      let match = line.match(/=(.*?)([;,]|\/\/.*|\))?$/)
      // console.log(match)
      if (match && match[1].indexOf('(') === -1) {
        s.appendText(match[1].trim())
      } else {
        s.appendPlaceholder(ports[i].name)
      }
    } else {
      s.appendPlaceholder(ports[i].name)
    }
    s.appendText(`)${endstr}`)
  }
  return s
}

function positionsFromRange(doc: vscode.TextDocument, range: vscode.Range): vscode.Position[] {
  let ret: vscode.Position[] = []
  for (let i = range.start.line; i <= range.end.line; i++) {
    const line = doc.lineAt(i)
    const words = line.text.match(/\b(\w+)\b/g)
    let match

    if (words) {
      // Use a regex to find words and their indices within the line
      const regex = /\b(\w+)\b/g
      while ((match = regex.exec(line.text)) !== null) {
        // Calculate the start and end positions of each word
        ret.push(new vscode.Position(i, match.index))
      }
    }
  }
  return ret
}

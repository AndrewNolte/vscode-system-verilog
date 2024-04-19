import * as child from 'child_process'
import * as vscode from 'vscode'
import { Logger } from '../logger'
import { ext } from '../extension'

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
    return new vscode.DocumentSymbol(
      this.name,
      this.type,
      Symbol.getSymbolKind(this.type),
      this.fullRange ?? this.getIdRange(),
      this.getIdRange()
    )
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

  // types used by ctags
  // taken from https://github.com/universal-ctags/ctags/blob/master/parsers/verilog.c
  static getSymbolKind(name: String): vscode.SymbolKind {
    switch (name) {
      case 'constant':
        return vscode.SymbolKind.Constant
      case 'parameter':
        return vscode.SymbolKind.Constant
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
        return vscode.SymbolKind.Class
      case 'covergroup':
        return vscode.SymbolKind.Class // No idea what to use
      case 'enum':
        return vscode.SymbolKind.Enum
      case 'interface':
        return vscode.SymbolKind.Interface
      case 'modport':
        return vscode.SymbolKind.Boolean // same as ports
      case 'package':
        return vscode.SymbolKind.Package
      case 'program':
        return vscode.SymbolKind.Module
      case 'prototype':
        return vscode.SymbolKind.Function
      case 'property':
        return vscode.SymbolKind.Property
      case 'struct':
        return vscode.SymbolKind.Struct
      case 'typedef':
        return vscode.SymbolKind.TypeParameter
      default:
        return vscode.SymbolKind.Variable
    }
  }
}

// TODO: add a user setting to enable/disable all ctags based operations
export class CtagsParser {
  /// Symbol definitions (no rhs)
  symbols: Symbol[]
  doc: vscode.TextDocument
  isDirty: boolean
  private logger: Logger

  constructor(logger: Logger, document: vscode.TextDocument) {
    this.symbols = []
    this.isDirty = true
    this.logger = logger
    this.doc = document
    ext.ctags.path.listen()
  }

  clearSymbols() {
    this.isDirty = true
    this.symbols = []
  }

  async getSymbols({ name, type }: { name?: string; type?: string } = {}): Promise<Symbol[]> {
    if (this.isDirty) {
      await this.index()
    }
    if (type !== undefined) {
      return this.symbols.filter((sym) => sym.type === type)
    }
    if (name !== undefined) {
      return this.symbols.filter((sym) => sym.name === name)
    }
    return this.symbols
  }

  async getModules(): Promise<Symbol[]> {
    let syms = await this.getSymbols()
    return syms.filter((tag) => tag.type === 'module' || tag.type === 'interface')
  }

  async getPackageSymbols(): Promise<Symbol[]> {
    let syms = await this.getSymbols()
    return syms.filter((tag) => tag.type !== 'member' && tag.type !== 'register')
  }

  async execCtags(filepath: string): Promise<string> {
    let command: string =
      ext.ctags.path.getValue() +
      ' -f - --fields=+K --sort=no --excmd=n --fields-SystemVerilog=+{parameter} "' +
      filepath +
      '"'
    this.logger.info('Executing Command: ' + command)
    return new Promise((resolve, _reject) => {
      child.exec(command, (_error: child.ExecException | null, stdout: string, _stderr: string) => {
        resolve(stdout)
      })
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
        // Parse ctags output
        let lines: string[] = tags.split(/\r?\n/)
        lines.forEach((line) => {
          if (line !== '') {
            let sym = this.parseTagLine(line)
            if (sym !== undefined) {
              this.symbols.push(sym)
            }
          }
        })

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

  async index(): Promise<void> {
    this.logger.info('indexing ', this.doc.uri.fsPath)
    let output = await this.execCtags(this.doc.uri.fsPath)
    await this.buildSymbolsList(output)
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

  getModuleSnippet(module: Symbol, fullModule: boolean) {
    let portsName: string[] = []
    let parametersName: string[] = []

    let scope = module.parentScope !== '' ? module.parentScope + '.' + module.name : module.name
    let ports: Symbol[] = this.symbols.filter(
      (tag) => tag.type === 'port' && tag.parentScope === scope
    )
    portsName = ports.map((tag) => tag.name)
    let params: Symbol[] = this.symbols.filter(
      (tag) => tag.type === 'parameter' && tag.parentScope === scope
    )
    parametersName = params.map((tag) => tag.name)
    let paramString = ``
    if (parametersName.length > 0) {
      paramString = `\n${instantiatePort(parametersName)}`
    }

    if (fullModule) {
      return new vscode.SnippetString()
        .appendText(module.name + ' ')
        .appendText('#(')
        .appendText(paramString)
        .appendText(') ')
        .appendPlaceholder(`${module.name.toLowerCase()}`)
        .appendText(' (\n')
        .appendText(instantiatePort(portsName))
        .appendText(');\n')
    }
    return (
      new vscode.SnippetString()
        // .appendText('#(')
        .appendText(paramString)
        .appendText(') ')
        .appendPlaceholder(`${module.name.toLowerCase()}`)
        .appendText(' (\n')
        .appendText(instantiatePort(portsName))
    )
  }
}

function instantiatePort(ports: string[]): string {
  let port = ''
  let maxLen = 0
  for (let i = 0; i < ports.length; i++) {
    if (ports[i].length > maxLen) {
      maxLen = ports[i].length
    }
  }
  // .NAME(NAME)
  for (let i = 0; i < ports.length; i++) {
    let element = ports[i]
    let padding = maxLen - element.length
    element = element + ' '.repeat(padding)
    port += `\t.${element}(${ports[i]})`
    if (i !== ports.length - 1) {
      port += ','
    }
    port += '\n'
  }
  return port
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

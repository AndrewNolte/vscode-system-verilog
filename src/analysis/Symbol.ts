import * as vscode from 'vscode'
import { VerilogDoc } from './VerilogDoc'

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
  verilogDoc: VerilogDoc
  children: Symbol[]
  constructor(
    doc: vscode.TextDocument,
    verilogDoc: VerilogDoc,
    name: string,
    type: string,
    startLine: number,
    parentScope: string,
    parentType: string,
    typeRef: string | null,
    isValid?: boolean
  ) {
    this.doc = doc
    this.verilogDoc = verilogDoc
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
    return this.type === 'module' || this.type === 'interface' || this.type === 'package'
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
    item.insertText = this.name
    if (!(this.type === 'typedef' || this.type === 'instance')) {
      item.documentation = this.getHoverText()
    }
    return item
  }

  public getMacroCompletionItem(): vscode.CompletionItem | undefined {
    if (!this.isMacro()) {
      return undefined
    }
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
    let item = new vscode.CompletionItem(this.name, vscode.CompletionItemKind.Snippet)
    item.detail = this.type
    item.filterText = this.name
    item.insertText = snip
    item.documentation = txt
    item.label = '`' + item.label
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

  public getIcon(): string {
    switch (this.type) {
      case 'module':
        return 'chip'
      case 'instance':
        return 'symbol-class'
      case 'interface':
        return 'symbol-interface'
      case 'constant':
        return 'symbol-constant'
      case 'class':
        return 'symbol-class'
      case 'function':
        return 'symbol-function'
      case 'task':
        return 'symbol-function'
      case 'covergroup':
        return 'symbol-class'
      case 'enum':
        return 'symbol-enum'
      case 'typedef':
        return 'symbol-struct'
      case 'property':
        return 'symbol-property'
      case 'struct':
        return 'symbol-struct'
      case 'net':
        return 'symbol-variable'
      case 'port':
        return 'symbol-interface'
      case 'register':
        return 'symbol-variable'
      case 'event':
        return 'symbol-variable'
      case 'parameter':
        return 'symbol-type-parameter'
      case 'modport':
        return 'symbol-interface'
      case 'prototype':
        return 'symbol-function'
      case 'assert':
        return 'symbol-function'
      default:
        return ''
    }
  }

  getModuleSnippet(includeName: boolean = false): vscode.SnippetString {
    let ports: Symbol[] = this.verilogDoc.symbols.filter(
      (tag) => tag.type === 'port' && tag.parentScope === this.name
    )
    let params: Symbol[] = this.verilogDoc.symbols.filter(
      (tag) => tag.type === 'parameter' && tag.parentScope === this.name
    )

    let s = new vscode.SnippetString()
    if (includeName) {
      s = s.appendText(this.name).appendText(' #')
    }
    s = s.appendText('(')
    if (params.length > 0) {
      s.appendText('\n')
      s = appendPorts(s, params, true)
    }
    s.appendText(') ')
    s = s.appendPlaceholder(`${this.name.toLowerCase()}`).appendText(' (\n')
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

import * as child_process from 'child_process'
import * as vscode from 'vscode'
import { ext } from '../extension'
import { InlayPorts } from '../InlayHintsComponent'
import { Logger } from '../lib/logger'
import { Symbol } from './Symbol'
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

class VerilogPortHint extends vscode.InlayHint {
  implicit: boolean

  constructor(
    position: vscode.Position,
    label: string,
    kind: vscode.InlayHintKind,
    implicit: boolean
  ) {
    super(position, label, kind)
    this.implicit = implicit
  }
}

// TODO: add a user setting to enable/disable all ctags based operations
export class VerilogDoc {
  /// Symbol definitions (no rhs)
  doc: vscode.TextDocument
  isDirty: boolean
  symbols: Symbol[]
  importSymbols: Symbol[] | undefined
  topSymbols: Symbol[]
  hoverSet: Set<string> = new Set()
  private logger: Logger

  constructor(logger: Logger, document: vscode.TextDocument) {
    this.symbols = []
    this.importSymbols = undefined
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
      this.importSymbols = undefined

      // TODO: make this parallel, need to make buildSymbolsList functional
    }
    if (addImports) {
      if (this.importSymbols === undefined) {
        this.importSymbols = await this.parseImports()
      }
      return filterSymbols(this.symbols.concat(this.importSymbols), filter)
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
      const ctags = ext.index.getVerilogDoc(doc)
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

  NON_PKG_TYPES = new Set(['member', 'register', 'port', 'define'])

  async getPackageSymbols(): Promise<Symbol[]> {
    let syms = await this.getSymbols({}, false)
    return syms.filter((tag) => !this.NON_PKG_TYPES.has(tag.type))
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
      return new Symbol(this.doc, this, name, type, lineNo, parentScope, parentType, typeref, false)
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
          this.logger.info('Building symbol tree for ', this.doc.uri.fsPath)
          this.topSymbols = []
          let symMap = new Map<string, Symbol>()
          for (let sym of this.symbols) {
            if (sym.parentScope !== '') {
              if (sym.name.startsWith('`')) {
                // macro calls sometimes get counted as being in a hierarchy
                continue
              }
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
    await this.getSymbols({}, false)
    return this.topSymbols
  }

  async getNestedHoverText(sym: Symbol): Promise<Array<string>> {
    let ret: string[] = []
    ret.push(sym.getHoverText())
    if (!(sym.type in ['port', 'parameter'])) {
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

  async getPortHints(
    inst: Symbol,
    wildcardPorts: boolean,
    normalPorts: InlayPorts
  ): Promise<VerilogPortHint[] | undefined> {
    // can only operate on insts
    if (inst.type !== 'instance' || inst.typeRef === null) {
      return undefined
    }

    // get ports from this inst's module definition
    const module = await ext.index.findModule(inst.typeRef)
    if (module === undefined) {
      return undefined
    }
    let ports: Symbol[] = await module.getSymbols({ type: 'port' }, false)
    ports = ports.filter((port) => port.parentScope === inst.typeRef)
    const portMap = new Map<string, Symbol>()
    ports.forEach((port) => {
      portMap.set(port.name, port)
    })

    // search each port name in the range of this instance
    let hints: VerilogPortHint[] = []

    const fullRange = inst.getFullRange()
    const instTextIndex = this.doc.offsetAt(fullRange.start)
    const instText = this.doc.getText(fullRange)

    // do implicit ports
    if (wildcardPorts) {
      const instNameInd = instText.indexOf(inst.name)
      const dotStar = instText.indexOf('.*', instNameInd)
      if (dotStar !== -1 && ports.length > 0) {
        // return all ports as a single multiline hint
        let hover = ports.map((port) => port.name).join(', ')
        hover = ': ' + hover
        hints.push(
          new VerilogPortHint(
            this.doc.positionAt(instTextIndex + dotStar + 2),
            hover,
            vscode.InlayHintKind.Type,
            true
          )
        )
      }
    }

    // do explicit/implicit ports
    if (
      normalPorts === InlayPorts.ON ||
      (normalPorts === InlayPorts.HOVER && this.hoverSet.has(inst.name))
    ) {
      const portHintMap = new Map<string, VerilogPortHint>()
      let match
      const wordRe = /\s\.(\w+)\b/g
      let longestHint = 0
      while ((match = wordRe.exec(instText)) !== null) {
        const portName = match[1]
        const portSym = portMap.get(portName)
        if (match.index === undefined) {
          break
        }
        if (portSym !== undefined) {
          let hover = portSym.getHoverText()
          hover = hover.substring(0, hover.lastIndexOf(portSym.name) - 1)
          hover = hover.startsWith('(') ? hover.slice(1) : hover
          const hintPos = this.doc.positionAt(instTextIndex + match.index + 2 + portName.length)
          const parensInd = this.doc.lineAt(hintPos.line).text.indexOf('(')
          const hint = new VerilogPortHint(
            hintPos,
            ': ' + hover,
            vscode.InlayHintKind.Type,
            parensInd === -1
          )
          portHintMap.set(portSym.name, hint)
          // keep track of longest hint for padding
          if (parensInd !== -1) {
            longestHint = Math.max(longestHint, hint.label.length)
          }
        }
      }
      // pad the shorter hints to match the longest
      for (const [_key, hint] of portHintMap) {
        // assert that label is string
        if (!hint.label) {
          continue
        }
        if (hint.label.length < longestHint) {
          if (!hint.implicit) {
            hint.label = hint.label + ' '.repeat(longestHint - hint.label.length)
          }
        }
        hints.push(hint)
      }
    }

    return hints
  }
}

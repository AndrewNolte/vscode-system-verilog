// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { Symbol } from './ctagsParser'
import { ext } from '../extension'
import { anyVerilogSelector, getParentText, getPrev2Char, getPrevChar } from '../utils'
import { ExtensionComponent } from '../lib/libconfig'
import builtins from './builtins.json'

export class CtagsServerComponent
  extends ExtensionComponent
  implements
    vscode.CompletionItemProvider,
    vscode.DocumentSymbolProvider,
    vscode.DefinitionProvider,
    vscode.HoverProvider
{
  builtinsPath: string | undefined
  builtinCompletions: Map<string, vscode.CompletionItem> = new Map()
  builtinHovers: Map<string, vscode.Hover> = new Map()

  async activate(context: vscode.ExtensionContext) {
    // push provider subs to .v and .sv files
    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(anyVerilogSelector, this)
    )

    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        anyVerilogSelector,
        this,
        '.', // params, ports, hierarchical references
        '(', // query normal completion
        ':', // pkg scope (::), wire width
        '`', // macros
        '[', // wire width, filter for params
        '#', // module inst
        '$' // builtins
      )
    )

    context.subscriptions.push(vscode.languages.registerHoverProvider(anyVerilogSelector, this))

    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(anyVerilogSelector, this)
    )
  }

  async loadBuiltins() {
    // load builtins for json

    for (let key in builtins) {
      // builtin completion
      let item = new vscode.CompletionItem('$' + key, vscode.CompletionItemKind.Function)
      let builtin = builtins[key as keyof typeof builtins]
      item.documentation = builtin.description
      let s = new vscode.SnippetString()
      s = s.appendText(key + '(')
      let args = builtin.args
      // append placeholders and correct commas
      for (let i = 0; i < args.length; i++) {
        s = s.appendPlaceholder(args[i].name)
        if (i < args.length - 1) {
          s = s.appendText(', ')
        }
      }
      s = s.appendText(')')
      item.insertText = s
      this.builtinCompletions.set(key, item)

      // builtin hover
      let md = new vscode.MarkdownString()
      let desc = builtin.description.split('. ').join('.\n')
      md.appendText(desc)
      let arglist = []
      for (let arg of args) {
        arglist.push(arg.type + ' ' + arg.name)
      }
      md.appendCodeblock(`$${key}(${arglist.join(', ')})`, 'systemverilog')
      this.builtinHovers.set(key, new vscode.Hover(md))
    }
  }

  async provideModuleCompletion(
    document: vscode.TextDocument,
    position: vscode.Position, // module_name #(
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    this.logger.info('Module Completion requested')
    let items: vscode.CompletionItem[] = []

    let moduleRange = document.getWordRangeAtPosition(position.translate(0, -2))
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

  ////////////////////////////////////////////////
  // Completion Provider
  ////////////////////////////////////////////////

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    let prevChar = getPrevChar(document, position)
    let prev2Char = getPrev2Char(document, position)
    this.logger.info(
      'providing completion on ' + context.triggerCharacter + ' ' + prevChar + ' ' + prev2Char
    )

    // Module inst Completion
    if (context.triggerCharacter === '#') {
      return await this.provideModuleCompletion(document, position, _token, context)
    }

    // Macro Completion
    if (context.triggerCharacter === '`') {
      let macroCompletions = []
      for (let sym of ext.ctags.getSymbolMap().values()) {
        macroCompletions.push(sym[0].getCompletionItem())
      }
      return macroCompletions
    }

    // Builtin Completion
    if (context.triggerCharacter === '$') {
      return Array.from(this.builtinCompletions.values())
    }

    let symbols: Symbol[] = []

    // Find which file to source symbols from
    if (context.triggerCharacter === ':' && prev2Char === ':') {
      // package file
      let pkgRange = document.getWordRangeAtPosition(position.translate(0, -2))
      let pkgName = document.getText(pkgRange)
      let ctags = await ext.ctags.findModule(pkgName)
      if (ctags === undefined) {
        return []
      }
      symbols = await ctags.getPackageSymbols()
    } else if (context.triggerCharacter === '.') {
      let parentScope = getParentText(document, new vscode.Range(position, position))

      if (parentScope === '') {
        // port completion
        symbols = await ext.ctags.getCtags(document).getSymbols({ type: 'instance' })
        // TODO: binary search instead
        symbols = symbols.filter(
          (inst) => inst.getFullRange().contains(position) && inst.typeRef !== null
        )
        let inst = symbols[0]
        if (inst.typeRef !== null) {
          let mod = await ext.ctags.findModule(inst.typeRef)

          if (mod) {
            let isPort = position.isAfter(inst.getIdRange().end)
            if (isPort) {
              symbols = (await mod.getSymbols()).filter((sym) => sym.type === 'port')
            } else {
              symbols = (await mod.getSymbols()).filter((sym) => sym.type === 'parameter')
            }
          }
        }
      } else {
        // hierarchial reference completion
        let insts = await ext.ctags.getCtags(document).getSymbols({ name: parentScope })
        if (insts.length > 0 && insts[0].typeRef !== null) {
          let mod = await ext.ctags.findModule(insts[0].typeRef)
          if (mod) {
            symbols = (await mod.getSymbols()).filter((sym) => sym.isData())
          }
        }
      }
    } else {
      // this file
      symbols = await ext.ctags.getCtags(document).getSymbols()

      // wire width, ex: logic[some_param-1:0]
      // TODO: detect if we're in a functional block or not to restrict to params
      if (context.triggerCharacter === ':') {
        symbols = symbols.filter((sym) => sym.isConstant())
      } else if (context.triggerCharacter === '[') {
        symbols = symbols.filter((sym) => sym.isData())
      }
    }

    let items = symbols.map((symbol: Symbol) => {
      return symbol.getCompletionItem()
    })

    this.logger.info(`Returning ${items.length} completion items`)
    return items
  }

  ////////////////////////////////////////////////
  // Hover Provider
  ////////////////////////////////////////////////

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
    let pchar = getPrevChar(document, range.start)
    if (pchar === '$') {
      return this.builtinHovers.get(document.getText(range))
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

  ////////////////////////////////////////////////
  // Definition Provider
  ////////////////////////////////////////////////

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
  ////////////////////////////////////////////////
  // Document Symbol Provider
  ////////////////////////////////////////////////

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

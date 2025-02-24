// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { ext } from '../extension'
import { InlayPorts } from '../InlayHintsComponent'
import { ExtensionComponent } from '../lib/libconfig'
import { anyVerilogSelector, getParentText, getPrev2Char, getPrevChar } from '../utils'
import builtins from './builtins.json'
import { Symbol } from './Symbol'

export class CtagsServerComponent
  extends ExtensionComponent
  implements
    vscode.CompletionItemProvider,
    vscode.DocumentSymbolProvider,
    vscode.DefinitionProvider,
    vscode.HoverProvider,
    vscode.InlayHintsProvider
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

    context.subscriptions.push(
      vscode.languages.registerInlayHintsProvider(anyVerilogSelector, this)
    )
  }

  async loadBuiltins() {
    // load builtins from json

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

  ////////////////////////////////////////////////
  // Completion Providers
  ////////////////////////////////////////////////

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

    let module = await ext.index.findModuleSymbol(moduleName)
    if (module === undefined) {
      return []
    }
    let newItem: vscode.CompletionItem = new vscode.CompletionItem(
      module.getHoverText(),
      vscode.CompletionItemKind.Module
    )
    newItem.insertText = module.getModuleSnippet(false)
    items.push(newItem)

    return items
  }

  async providePortParamCompletion(
    document: vscode.TextDocument,
    position: vscode.Position, // module_name #(
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    this.logger.info(`Finding completions for ports/params`)
    const instances = await ext.index.getVerilogDoc(document).getSymbols({ type: 'instance' })
    // TODO: binary search instead
    const inst = instances.reverse().find((inst) => {
      return inst.getFullRange().start.compareTo(position) < 0
    })
    if (inst === undefined || inst.typeRef === null) {
      this.logger.info("Couldn't find suitable instance for port/param completion")
      return []
    }
    let mod = await ext.index.findModule(inst.typeRef)
    if (mod === undefined) {
      this.logger.info(`Couldn't find module ${inst.typeRef} for completions`)
      return []
    }

    let ports = (await mod.getSymbols()).filter(
      (sym) => (sym.type === 'port' || sym.type === 'parameter') && sym.parentScope === inst.typeRef
    )
    return ports.map((sym) => sym.getCompletionItem())
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[]> {
    let prevChar = getPrevChar(document, position)
    let prev2Char = getPrev2Char(document, position)
    this.logger.info(
      'providing completion on ' + context.triggerCharacter + ' ' + prevChar + ' ' + prev2Char
    )

    // Module inst Completion
    if (context.triggerCharacter === '#') {
      const moduleCompletions = await this.provideModuleCompletion(
        document,
        position,
        token,
        context
      )
      this.logger.info(`Returning ${moduleCompletions.length} module completions`)
      return moduleCompletions
    }

    // Macro Completion
    if (context.triggerCharacter === '`') {
      let macroCompletions = []
      for (let symbols of ext.index.symbolMap.values()) {
        const completion = symbols[0].getMacroCompletionItem()
        if (completion) {
          macroCompletions.push(completion)
        }
      }
      this.logger.info(`Returning ${macroCompletions.length} macro completions`)
      return macroCompletions
    }

    // Builtin Completion
    if (context.triggerCharacter === '$') {
      return Array.from(this.builtinCompletions.values())
    }

    let symbols: Symbol[] = []
    let additionalCompletions: vscode.CompletionItem[] = []

    // Find which file to source symbols from
    if (prevChar === ':' && prev2Char === ':') {
      // package file
      let pkgRange = document.getWordRangeAtPosition(position.translate(0, -2))
      let pkgName = document.getText(pkgRange)
      let ctags = await ext.index.findModule(pkgName)
      if (ctags === undefined) {
        this.logger.info('Package not found')
        return []
      }
      symbols = await ctags.getPackageSymbols()
      this.logger.info(`Found ${symbols.length} completions in package ${pkgName}`)
    } else if (context.triggerCharacter === '.') {
      let parentScope = getParentText(document, new vscode.Range(position, position))

      if (parentScope === '') {
        const portCompletions = await this.providePortParamCompletion(
          document,
          position,
          token,
          context
        )
        this.logger.info(`Returning ${portCompletions.length} port/param completions`)
        return portCompletions
      } else {
        // hierarchial reference completion
        let insts = await ext.index.getVerilogDoc(document).getSymbols({ name: parentScope })
        this.logger.info(`Fetching hierarchical completion`)
        if (insts.length > 0 && insts[0].typeRef !== null) {
          let mod = await ext.index.findModule(insts[0].typeRef)
          if (mod) {
            symbols = (await mod.getSymbols()).filter((sym) => sym.isData())
          }
        }
      }
    } else {
      // this file
      this.logger.info('Fetching completions from current file')
      symbols = await ext.index.getVerilogDoc(document).getSymbols()

      // wire width, ex: logic[some_param-1:0]
      // TODO: detect if we're in a functional block or not to restrict to params
      if (context.triggerCharacter === ':') {
        symbols = symbols.filter((sym) => sym.isConstant())
      } else if (context.triggerCharacter === '[') {
        symbols = symbols.filter((sym) => sym.isData())
      } else if (context.triggerCharacter === undefined) {
        for (let name of ext.index.moduleMap.keys()) {
          additionalCompletions.push(
            new vscode.CompletionItem(
              {
                label: name,
                detail: ' Component', // would need to open files to determin module/interface/package
              },
              vscode.CompletionItemKind.Module
            )
          )
        }
      }
      symbols = symbols.filter((sym) => !(sym.type === 'block' && sym.children.length === 0))
    }

    let items = symbols.map((symbol: Symbol) => {
      return symbol.getCompletionItem()
    })

    items.push(...additionalCompletions)

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

    let syms: Symbol[] = await ext.index.findSymbol(document, position)
    if (syms.length === 0) {
      this.logger.warn('Hover object not found')
      return undefined
    }

    let sym = syms[0]
    let ctags = ext.index.getVerilogDoc(sym.doc)

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
  // Inlay Hints Provider
  ////////////////////////////////////////////////
  onDidChangeInlayHintsEmitter: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
  readonly onDidChangeInlayHints: vscode.Event<void> = this.onDidChangeInlayHintsEmitter.event

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    _token: vscode.CancellationToken
  ): Promise<vscode.InlayHint[]> {
    const wildcardPorts = ext.inlayHints.wildcardPorts.getValue() === 'on'
    const ports = ext.inlayHints.ports.getValue()
    if (!wildcardPorts && ports === InlayPorts.OFF) {
      return []
    }
    let hints = []
    // get module insts in range with a typeRef
    const verilogDoc = ext.index.getVerilogDoc(document)
    let insts = await verilogDoc.getSymbols({ type: 'instance' })
    insts = insts.filter((inst) => inst.getFullRange().intersection(range) !== undefined)
    insts = insts.filter((inst) => inst.typeRef !== null)
    const hintPromises = insts.map(async (inst) => {
      return await verilogDoc.getPortHints(inst, wildcardPorts, ports)
    })
    this.logger.info(`provideInlayHints() => Found ${insts.length} module instances`)
    for (let hintPromise of hintPromises) {
      const instHints = await hintPromise
      if (instHints !== undefined) {
        hints.push(...instHints)
      }
    }
    return hints
  }

  async findIncludes(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.DefinitionLink[]> {
    let match
    const line = document.lineAt(position.line).text
    const stringRegex = /("([^"]*)")/g
    while ((match = stringRegex.exec(line)) !== null) {
      // check bounds
      if (
        !(match.index <= position.character && position.character < match.index + match[1].length)
      ) {
        continue
      }

      let resolvedPath = await ext.includes.resolve(document, match[2])
      if (!resolvedPath) {
        continue
      }
      return [
        {
          targetUri: vscode.Uri.file(resolvedPath),
          originSelectionRange: new vscode.Range(
            position.line,
            match.index,
            position.line,
            match.index + match[0].length
          ),
          targetRange: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0)),
        },
      ]
    }
    return []
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
    const symPromise = ext.index.findSymbol(document, position)
    const includePromise = this.findIncludes(document, position)
    // find all matching symbols
    let syms: Symbol[] = await symPromise
    this.logger.info(syms.length + ' definitions returned from ctags')
    let ret: vscode.LocationLink[] = []
    if (syms.length > 0) {
      ret = syms.map((sym) => sym.getDefinitionLink())
    }
    const includes = await includePromise
    if (includes.length > 0) {
      return includes
    }
    return ret
  }
  ////////////////////////////////////////////////
  // Document Symbol Provider
  ////////////////////////////////////////////////

  async provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    this.logger.info(`provideDocumentSymbols(${document.uri}) => ...`)
    const tree = await ext.index.getVerilogDoc(document).getSymbolTree()
    try {
      const docSymbols = tree.map((sym) => sym.getDocumentSymbol())
      this.logger.info(`provideDocumentSymbols(${document.uri}) => ${docSymbols.length} symbols`)
      return docSymbols
    } catch (e) {
      this.logger.error(`provideDocumentSymbols(${document.uri}) => ${e}`)
      return []
    }
  }
}

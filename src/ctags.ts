// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { CtagsParser, Symbol } from './parsers/ctagsParser'
import { getParentText, getPrevChar, getWorkspaceFolder } from './utils'
import { ext } from './extension'
import { ExtensionComponent, ConfigObject } from './libconfig'

export class CtagsManager extends ExtensionComponent {
  // file -> parser
  private filemap: Map<vscode.TextDocument, CtagsParser> = new Map()
  /// symbol name -> symbols (from includes)
  private symbolMap: Map<string, Symbol[]> = new Map()
  /// module name -> file, we assumed name.sv containes name module
  private moduleMap: Map<string, vscode.Uri> = new Map()

  path: ConfigObject<string> = new ConfigObject({
    default: 'ctags',
    description: 'Path to ctags universal executable',
  })

  activate(_context: vscode.ExtensionContext): void {
    this.logger.info('activating')
    vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
      this.filemap.delete(doc)
    })

    ext.includes.onConfigUpdated(() => this.indexIncludes())
    this.index()
  }

  getSearchPrefix() {
    let dir = ext.directory.getValue()
    if (dir !== undefined) {
      return `${dir}/**`
    }
    return '**'
  }

  async indexIncludes(): Promise<void> {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Verilog Includes',
        cancellable: true,
      },
      async () => {
        let incs = ext.includes.getValue()
        incs.forEach(async (path: string) => {
          let files: vscode.Uri[] = await this.findFiles(`${path}/*.{svh}`)

          files.forEach(async (file: vscode.Uri) => {
            let doc = await vscode.workspace.openTextDocument(file)
            let syms = await this.getCtags(doc).getPackageSymbols()
            syms.forEach((element: Symbol) => {
              if (this.symbolMap.has(element.name)) {
                this.symbolMap.get(element.name)?.push(element)
              } else {
                this.symbolMap.set(element.name, [element])
              }
            })
          })
        })
        this.logger.info(`indexed ${incs.length} include paths`)
      }
    )
  }

  async index(): Promise<void> {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Verilog',
        cancellable: true,
      },
      async () => {
        let pattern = `${this.getSearchPrefix()}/*.{sv,v}`
        this.logger.info('indexing ' + pattern)
        // We want to do a shallow index
        let files: vscode.Uri[] = await this.findFiles(`${this.getSearchPrefix()}/*.{sv,v}`)
        files.forEach(async (file: vscode.Uri) => {
          let name = file.path.split('/').pop()?.split('.').shift() ?? ''
          this.moduleMap.set(name, file)
        })
        this.logger.info(`indexed ${this.moduleMap.size} verilog files`)
      }
    )
  }

  getCtags(doc: vscode.TextDocument): CtagsParser {
    let ctags: CtagsParser | undefined = this.filemap.get(doc)
    if (ctags === undefined) {
      ctags = new CtagsParser(this.logger, doc)
      this.filemap.set(doc, ctags)
    }
    return ctags
  }

  onSave(doc: vscode.TextDocument) {
    let ctags: CtagsParser = this.getCtags(doc)
    ctags.clearSymbols()
  }

  async findFiles(pattern: string): Promise<vscode.Uri[]> {
    let ws = getWorkspaceFolder()
    if (ws === undefined) {
      return []
    }
    let searchPattern = new vscode.RelativePattern(ws, pattern)
    return await vscode.workspace.findFiles(searchPattern)
  }

  async findModule(moduleName: string): Promise<vscode.TextDocument | undefined> {
    let file = this.moduleMap.get(moduleName)
    if (file === undefined) {
      return undefined
    }
    return await vscode.workspace.openTextDocument(file)
  }

  async findDefinitionByName(moduleName: string, targetText: string): Promise<Symbol[]> {
    let file = await this.findModule(moduleName)
    if (file === undefined) {
      return []
    }
    let parser = this.getCtags(file)
    return await parser.getSymbols({ name: targetText })
  }

  /// Finds a symbols definition, but also looks in targetText.sv to get module/interface defs
  async findSymbol(document: vscode.TextDocument, position: vscode.Position): Promise<Symbol[]> {
    let textRange = document.getWordRangeAtPosition(position)
    if (!textRange || textRange.isEmpty) {
      return []
    }
    let parser = this.getCtags(document)
    let targetText = document.getText(textRange)
    let symPromise = parser.getSymbols({ name: targetText })
    let syms: Symbol[] | undefined = undefined

    let parentScope = getParentText(document, textRange)
    // let modulePromise = this.findDefinitionByName(parentScope, targetText);
    // If we're at a port, .<text> plus no parent
    if (getPrevChar(document, textRange) === '.' && parentScope === targetText) {
      syms = await symPromise

      let insts = syms.filter((sym) => sym.type === 'instance')
      if (insts.length > 0) {
        let latestInst = insts.reduce((latest, inst) => {
          if (
            inst.startPosition.line < position.line &&
            inst.startPosition.line > latest.startPosition.line
          ) {
            return inst
          } else {
            return latest
          }
        }, insts[0])

        if (latestInst.typeRef !== null) {
          return await this.findDefinitionByName(latestInst.typeRef, targetText)
        }
      }
    }

    if (this.symbolMap.has(targetText)) {
      return this.symbolMap.get(targetText) ?? []
    }

    if (this.moduleMap.has(targetText) || this.moduleMap.has(parentScope)) {
      // find parentScope.sv of parentScope::targetText
      let sym = (await this.findDefinitionByName(parentScope, targetText)).at(0)
      // Sometimes package::x is found multiple times, return just the top level package
      if (sym !== undefined) {
        return [sym]
      }
    }
    return await symPromise
  }
}

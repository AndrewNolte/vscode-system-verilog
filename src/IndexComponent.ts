// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { Symbol } from './analysis/Symbol'
import { VerilogDoc } from './analysis/VerilogDoc'
import { ext } from './extension'
import { ConfigObject, ExtensionComponent } from './lib/libconfig'
import { getParentText, getPrevChar } from './utils'
import fs = require('fs')
import path = require('path')

export class IndexComponent extends ExtensionComponent {
  public readonly moduleMap: Map<string, vscode.Uri> = new Map()

  enableSymlinks: ConfigObject<boolean> = new ConfigObject({
    default: true,
    description:
      'Enable creating file symlinks in .sv_cache/files for the -y flag that most tools have. Created in a per-workspace exteneral directory that vscode provides',
  })

  indexAllIncludes: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Whether to index all .svh files',
  })

  cacheDir: vscode.Uri | undefined

  // file -> parser
  private filemap: Map<vscode.TextDocument, VerilogDoc> = new Map()

  /// uri -> set of instance names. Used to update inlay hints on hover
  hoverHistory: Map<vscode.Uri, Set<string>> = new Map()

  /// symbol name -> symbols (from includes)
  private symbolMap: Map<string, Symbol[]> = new Map()

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.logger.info('index activating')
    if (context.storageUri !== undefined) {
      this.cacheDir = vscode.Uri.joinPath(context.storageUri, '.sv_cache', 'files')
    }

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
        this.indexFile(doc.uri)
      })
    )
    context.subscriptions.push(
      vscode.workspace.onDidRenameFiles((e) => {
        e.files.forEach((file) => {
          this.indexFile(file.newUri)
        })
      })
    )

    this.onConfigUpdated(() => {
      this.indexFiles()
    })

    vscode.workspace.onDidCloseTextDocument((doc: vscode.TextDocument) => {
      this.filemap.delete(doc)
    })

    ext.includes.onConfigUpdated(() => {
      if (!(ext.ctags.indexAllIncludes.getValue() || this.indexAllIncludes.getValue())) {
        this.indexIncludes(true)
      }
    })

    vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
      this.getVerilogDoc(doc).clearSymbols()
    })

    ext.ctags.path.onConfigUpdated(async () => {
      await ext.ctags.path.checkPathNotify()
    })
  }

  async getDir(reset: boolean = false): Promise<vscode.Uri | undefined> {
    if (this.cacheDir === undefined) {
      return undefined
    }
    if (!fs.existsSync(this.cacheDir.fsPath)) {
      fs.mkdirSync(this.cacheDir.fsPath, { recursive: true })
    } else if (reset) {
      await vscode.workspace.fs.delete(this.cacheDir, { recursive: true })
      fs.mkdirSync(this.cacheDir.fsPath, { recursive: true })
    }
    return this.cacheDir
  }
  indexMem(uri: vscode.Uri) {
    // modulemap
    let name = uri.path.split('/').pop()?.split('.').shift() ?? ''
    this.moduleMap.set(name, uri)
  }

  async indexSym(dir: vscode.Uri, uri: vscode.Uri) {
    // symlink
    let sym = path.join(dir.fsPath, path.basename(uri.fsPath))
    if (fs.existsSync(sym)) {
      return
    }
    try {
      await fs.promises.symlink(uri.fsPath, sym)
    } catch (e) {
      // sometimes existsSync doesn't catch it
      // this.logger.warn(`Failed to create symlink ${sym} -> ${uri.fsPath}`)
      // this.logger.warn(`Error message: ${e}`)
    }
  }

  indexFile(uri: vscode.Uri) {
    this.indexMem(uri)
    if (this.enableSymlinks.getValue() && this.cacheDir !== undefined) {
      this.indexSym(this.cacheDir, uri)
    }
  }

  async findFile(moduleName: string): Promise<vscode.TextDocument | undefined> {
    let file = this.moduleMap.get(moduleName)
    if (file === undefined) {
      return undefined
    }
    return await vscode.workspace.openTextDocument(file)
  }

  findModuleUri(path: string): vscode.Uri | undefined {
    let name = path.split('/').pop()?.split('.').shift() ?? ''
    return this.moduleMap.get(name)
  }

  async indexFiles(reset: boolean = false): Promise<void> {
    let dir = await this.getDir(reset)
    if (dir === undefined) {
      return
    }

    let files: vscode.Uri[] = await ext.findModules()
    this.logger.info('indexing ' + files.length + ' files')

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Verilog files',
        cancellable: true,
      },
      async () => {
        for (let file of files) {
          this.indexMem(file)
        }
        if (this.enableSymlinks.getValue() && dir !== undefined) {
          let promises = files.map((file) => {
            this.indexSym(dir, file)
          })
          await Promise.all(promises)
        }
      }
    )
  }

  async indexIncludes(reset: boolean = false): Promise<void> {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Verilog Includes',
        cancellable: false,
      },
      async () => {
        let files: vscode.Uri[] = await ext.findIncludes()

        this.logger.info(`indexing ${files.length} .svh files`)
        if (reset) {
          this.symbolMap.clear()
        }

        files.forEach(async (file: vscode.Uri) => {
          let doc: vscode.TextDocument | undefined = undefined
          let retryCount = 0
          while (retryCount < 3) {
            try {
              doc = await vscode.workspace.openTextDocument(file)
              break
            } catch (e) {
              retryCount++
              await new Promise((resolve) => setTimeout(resolve, 10))
            }
          }

          if (doc === undefined) {
            this.logger.error('Failed to index file: ' + file.fsPath)
            return
          }

          let syms = await this.getVerilogDoc(doc).getSymbols()
          syms.forEach((element: Symbol) => {
            // only want to index top level symbols, i.e. macros
            if (element.parentScope !== '') {
              return
            }
            if (this.symbolMap.has(element.name)) {
              this.symbolMap.get(element.name)?.push(element)
            } else {
              this.symbolMap.set(element.name, [element])
            }
          })
          // close doc
        })

        this.logger.info(`indexed ${files.length} .svh files`)
      }
    )
  }

  getVerilogDoc(doc: vscode.TextDocument): VerilogDoc {
    let ctags: VerilogDoc | undefined = this.filemap.get(doc)
    if (ctags === undefined) {
      ctags = new VerilogDoc(this.logger, doc)
      this.filemap.set(doc, ctags)
    }
    return ctags
  }

  async findModule(moduleName: string): Promise<VerilogDoc | undefined> {
    let vscodeDoc = await ext.index.findFile(moduleName)
    if (vscodeDoc === undefined) {
      return undefined
    }
    return this.getVerilogDoc(vscodeDoc)
  }

  async findModuleSymbol(moduleName: string): Promise<Symbol | undefined> {
    let doc = await this.findModule(moduleName)
    if (doc === undefined) {
      this.logger.error('Failed to find module ' + moduleName)
      return undefined
    }
    let syms = (await doc.getSymbolTree()).filter((sym) => sym.name === moduleName)
    return syms.at(0)
  }

  async findDefinitionByName(moduleName: string, targetText: string): Promise<Symbol[]> {
    let doc = await this.findModule(moduleName)
    if (doc === undefined) {
      return []
    }
    return await doc.getSymbols({ name: targetText })
  }

  /// Finds a symbols definition, but also looks in targetText.sv to get module/interface defs
  async findSymbol(document: vscode.TextDocument, position: vscode.Position): Promise<Symbol[]> {
    let textRange = document.getWordRangeAtPosition(position)
    if (!textRange || textRange.isEmpty) {
      return []
    }
    let parser = this.getVerilogDoc(document)
    let targetText = document.getText(textRange)
    let symPromise = parser.getSymbols({ name: targetText })

    let parentScope = getParentText(document, textRange)
    // let modulePromise = this.findDefinitionByName(parentScope, targetText);
    // If we're at a port, .<text> plus no parent
    if (getPrevChar(document, textRange.start) === '.') {
      if (parentScope === targetText) {
        // param or port on instance
        let insts = await parser.getInstances()
        insts = insts.filter((inst) => inst.getFullRange().contains(position))
        if (insts.length > 0 && insts[0].typeRef !== null) {
          let s = this.hoverHistory.get(document.uri)
          if (s === undefined) {
            this.hoverHistory.set(document.uri, new Set([insts[0].name]))
          } else {
            s.add(insts[0].name)
          }
          ext.ctagsServer.onDidChangeInlayHintsEmitter.fire()
          return await this.findDefinitionByName(insts[0].typeRef, targetText)
        }
      } else if (parentScope !== undefined) {
        // hierarchcal reference to instance.wire
        let insts = await parser.getSymbols({ name: parentScope })
        if (insts.length > 0 && insts[0].typeRef !== null) {
          return await this.findDefinitionByName(insts[0].typeRef, targetText)
        }
      }
    }

    if (this.symbolMap.has(targetText)) {
      return this.symbolMap.get(targetText) ?? []
    }

    if (ext.index.moduleMap.has(targetText) || ext.index.moduleMap.has(parentScope)) {
      // find parentScope.sv of parentScope::targetText
      let sym = (await this.findDefinitionByName(parentScope, targetText)).at(0)
      // Sometimes package::x is found multiple times, return just the top level package
      if (sym !== undefined) {
        return [sym]
      }
    }
    return await symPromise
  }

  public getSymbolMap(): Map<string, Symbol[]> {
    return this.symbolMap
  }
}

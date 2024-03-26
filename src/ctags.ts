// SPDX-License-Identifier: MIT
import * as vscode from 'vscode';
import { Logger } from './logger';
import { CtagsParser, Symbol } from './parsers/ctagsParser';
import { getWorkspaceFolder } from './utils';

// Internal representation of a symbol

export class CtagsManager {
  private filemap: Map<vscode.TextDocument, CtagsParser> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.info('ctags manager configure');
    vscode.workspace.onDidSaveTextDocument(this.onSave.bind(this));
    vscode.workspace.onDidCloseTextDocument(this.onClose.bind(this));
  }

  getCtags(doc: vscode.TextDocument): CtagsParser {
    let ctags: CtagsParser | undefined = this.filemap.get(doc);
    if (ctags === undefined) {
      ctags = new CtagsParser(this.logger, doc);
      this.filemap.set(doc, ctags);
    }
    return ctags;
  }
  onClose(doc: vscode.TextDocument) {
    this.filemap.delete(doc);
  }

  onSave(doc: vscode.TextDocument) {
    this.logger.info('on save');
    let ctags: CtagsParser = this.getCtags(doc);
    ctags.clearSymbols();
  }

  async getSymbols(doc: vscode.TextDocument): Promise<Symbol[]> {
    let ctags: CtagsParser = this.getCtags(doc);
    // If dirty, re index and then build symbols
    if (ctags.isDirty) {
      await ctags.index();
    }
    return ctags.symbols;
  }

  /// find a matching symbol in a single document
  async findDefinition(
    document: vscode.TextDocument,
    targetText: string
  ): Promise<vscode.DefinitionLink[]> {
    let symbols: Symbol[] = await this.getSymbols(document);
    let matchingSymbols = symbols.filter((sym) => sym.name === targetText);

    return matchingSymbols.map((i) => {
      return {
        targetUri: document.uri,
        targetRange: new vscode.Range(
          i.startPosition,
          new vscode.Position(i.startPosition.line, Number.MAX_VALUE)
        ),
        targetSelectionRange: new vscode.Range(i.startPosition, i.endPosition),
      };
    });
  }

  async findModule(moduleName: string): Promise<vscode.TextDocument | undefined> {
    let ws = getWorkspaceFolder();
    if (ws === undefined) {
      return undefined;
    }
    let searchPattern = new vscode.RelativePattern(ws, `**/${moduleName}.{sv,v}`);
    let files = await vscode.workspace.findFiles(searchPattern);

    if (files.length === 0) {
      return undefined;
    }
    return await vscode.workspace.openTextDocument(files[0]);
  }

  async findDefinitionByName(
    moduleName: string,
    targetText: string
  ): Promise<vscode.DefinitionLink[]> {
    let file = await this.findModule(moduleName);
    if (file === undefined) {
      return [];
    }
    return await this.findDefinition(file, targetText);
  }

  getPrevChar(document: vscode.TextDocument, range: vscode.Range): string | undefined {
    const lineText = document.lineAt(range.start.line).text;
    if (range.start.character == 0) {
      return undefined;
    }
    return lineText.charAt(range.start.character - 1);
  }

  getParentText(document: vscode.TextDocument, textRange: vscode.Range): string {
    let range = textRange;
    let prevChar = this.getPrevChar(document, textRange);
    if (prevChar == '.') {
      // follow interface.modport
      range = document.getWordRangeAtPosition(range.start.translate(0, -1)) ?? range;
    } else if (prevChar == ':' && range.start.character > 1) {
      // follow package scope
      range = document.getWordRangeAtPosition(range.start.translate(0, -2)) ?? range;
    }
    return document.getText(range);
  }

  /// Finds a symbols definition, but also looks in targetText.sv to get module/interface defs
  async findSymbol(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.DefinitionLink[]> {
    let textRange = document.getWordRangeAtPosition(position);
    if (!textRange || textRange.isEmpty) {
      return [];
    }
    let targetText = document.getText(textRange);

    let parentScope = this.getParentText(document, textRange);
    // If we're at a port, .<text> plus no parent
    if (this.getPrevChar(document, textRange) == '.' && parentScope === targetText) {
      let insts = (await this.getSymbols(document)).filter((sym) => sym.type == 'instance');
      if (insts.length > 0) {
        let latestInst = insts.reduce((latest, inst) => {
          if (
            inst.startPosition.line < position.line &&
            inst.startPosition.line > latest.startPosition.line
          ) {
            return inst;
          } else {
            return latest;
          }
        }, insts[0]);

        if (latestInst.typeRef === null) {
          return [];
        }

        return await this.findDefinitionByName(latestInst.typeRef, targetText);
      }
    }

    // TODO: use promise.race
    const results: vscode.DefinitionLink[][] = await Promise.all([
      // find def in curretn document
      this.findDefinition(document, targetText),
      // search for module.sv or interface.sv
      this.findDefinitionByName(parentScope, targetText),
    ]);
    return results.reduce((acc, val) => acc.concat(val), []);
  }
}

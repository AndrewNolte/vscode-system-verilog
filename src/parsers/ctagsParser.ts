import * as child_process from 'child_process';
import { ExecException } from 'child_process';
import * as vscode from 'vscode';
import { Logger } from '../logger';

export class Symbol {
  name: string;
  type: string;
  pattern: string;
  startPosition: vscode.Position;
  endPosition: vscode.Position;
  parentScope: string;
  parentType: string;
  isValid: boolean;
  typeRef: string | null;
  constructor(
    name: string,
    type: string,
    pattern: string,
    startLine: number,
    parentScope: string,
    parentType: string,
    typeRef: string | null,
    endLine: number,
    isValid?: boolean
  ) {
    this.name = name;
    this.type = type;
    this.pattern = pattern;
    this.startPosition = new vscode.Position(startLine, 0);
    this.parentScope = parentScope;
    this.parentType = parentType;
    this.isValid = Boolean(isValid);
    this.typeRef = typeRef;
    this.endPosition = new vscode.Position(endLine, Number.MAX_VALUE);
  }

  setEndPosition(endLine: number) {
    this.endPosition = new vscode.Position(endLine, Number.MAX_VALUE);
    this.isValid = true;
  }

  getDocumentSymbol(): vscode.DocumentSymbol {
    let range = new vscode.Range(this.startPosition, this.endPosition);
    return new vscode.DocumentSymbol(
      this.name,
      this.type,
      Symbol.getSymbolKind(this.type),
      range,
      range
    );
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
        return false;
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
        return true;
    }
    return false;
  }

  // types used by ctags
  // taken from https://github.com/universal-ctags/ctags/blob/master/parsers/verilog.c
  static getSymbolKind(name: String): vscode.SymbolKind {
    switch (name) {
      case 'constant':
        return vscode.SymbolKind.Constant;
      case 'parameter':
        return vscode.SymbolKind.Constant;
      case 'event':
        return vscode.SymbolKind.Event;
      case 'function':
        return vscode.SymbolKind.Function;
      case 'module':
        return vscode.SymbolKind.Module;
      case 'net':
        return vscode.SymbolKind.Variable;
      // Boolean uses a double headed arrow as symbol (kinda looks like a port)
      case 'port':
        return vscode.SymbolKind.Boolean;
      case 'register':
        return vscode.SymbolKind.Variable;
      case 'task':
        return vscode.SymbolKind.Function;
      case 'block':
        return vscode.SymbolKind.Module;
      case 'assert':
        return vscode.SymbolKind.Variable; // No idea what to use
      case 'class':
        return vscode.SymbolKind.Class;
      case 'covergroup':
        return vscode.SymbolKind.Class; // No idea what to use
      case 'enum':
        return vscode.SymbolKind.Enum;
      case 'interface':
        return vscode.SymbolKind.Interface;
      case 'modport':
        return vscode.SymbolKind.Boolean; // same as ports
      case 'package':
        return vscode.SymbolKind.Package;
      case 'program':
        return vscode.SymbolKind.Module;
      case 'prototype':
        return vscode.SymbolKind.Function;
      case 'property':
        return vscode.SymbolKind.Property;
      case 'struct':
        return vscode.SymbolKind.Struct;
      case 'typedef':
        return vscode.SymbolKind.TypeParameter;
      default:
        return vscode.SymbolKind.Variable;
    }
  }
}

// TODO: add a user setting to enable/disable all ctags based operations
export class CtagsParser {
  /// Symbol definitions (no rhs)
  symbols: Symbol[];
  doc: vscode.TextDocument;
  isDirty: boolean;
  private logger: Logger;
  binPath: string;

  constructor(logger: Logger, document: vscode.TextDocument) {
    this.symbols = [];
    this.isDirty = true;
    this.logger = logger;
    this.doc = document;

    let binPath: string = <string>(
      vscode.workspace.getConfiguration().get('verilog.ctags.path', 'ctags')
    );
    if (binPath === 'none') {
      binPath = 'ctags';
    }
    this.binPath = binPath;
  }

  clearSymbols() {
    this.isDirty = true;
    this.symbols = [];
  }

  async getSymbols(): Promise<Symbol[]> {
    if (this.isDirty) {
      await this.index();
    }
    return this.symbols;
  }

  async execCtags(filepath: string): Promise<string> {
    let command: string =
      this.binPath +
      ' -f - --fields=+K --sort=no --excmd=n --fields-SystemVerilog=+{parameter} "' +
      filepath +
      '"';
    this.logger.info('Executing Command: ' + command);
    return new Promise((resolve, _reject) => {
      child_process.exec(
        command,
        (_error: ExecException | null, stdout: string, _stderr: string) => {
          resolve(stdout);
        }
      );
    });
  }

  parseTagLine(line: string): Symbol | undefined {
    try {
      let name, type, pattern, lineNoStr, parentScope, parentType: string;
      let typeref: string | null = null;
      let scope: string[];
      let lineNo: number;
      let parts: string[] = line.split('\t');
      name = parts[0];
      pattern = parts[2];
      type = parts[3];
      // override "type" for parameters (See #102)
      if (parts.length === 6) {
        if (parts[5] === 'parameter:') {
          type = 'parameter';
        }

        if (parts[5].startsWith('typeref')) {
          typeref = parts[5].split(':')[2];
        }
      }
      if (parts.length >= 5) {
        scope = parts[4].split(':');
        parentType = scope[0];
        parentScope = scope[1];
      } else {
        parentScope = '';
        parentType = '';
      }
      lineNoStr = parts[2];
      lineNo = Number(lineNoStr.slice(0, -2)) - 1;
      // pretty print symbol
      return new Symbol(
        name,
        type,
        pattern,
        lineNo,
        parentScope,
        parentType,
        typeref,
        lineNo,
        false
      );
    } catch (e) {
      this.logger.error('Line Parser: ' + e);
      this.logger.error('Line: ' + line);
    }
    return undefined;
  }

  async buildSymbolsList(tags: string): Promise<void> {
    try {
      if (this.isDirty) {
        this.logger.info('building symbols');
        if (tags === '') {
          this.logger.error('No output from ctags');
          return;
        }
        // Parse ctags output
        let lines: string[] = tags.split(/\r?\n/);
        lines.forEach((line) => {
          if (line !== '') {
            let sym = this.parseTagLine(line);
            if (sym !== undefined) {
              this.symbols.push(sym);
            }
          }
        });

        // end tags are not supported yet in ctags. So, using regex
        let match: RegExpExecArray | null = null;
        let endPosition: vscode.Position;
        let text = this.doc.getText();
        let eRegex: RegExp = /^(?![\r\n])\s*end(\w*)*[\s:]?/gm;
        while ((match = eRegex.exec(text))) {
          if (match === null) {
            break;
          }
          if (typeof match[1] !== 'undefined') {
            endPosition = this.doc.positionAt(match.index + match[0].length - 1);
            // get the starting symbols of the same type
            // doesn't check for begin...end blocks
            let s = this.symbols.filter((i) => {
              return (
                i.type === (match as RegExpExecArray)[1] &&
                i.startPosition.isBefore(endPosition) &&
                !i.isValid
              );
            });
            if (s.length > 0) {
              // get the symbol nearest to the end tag
              let max: Symbol = s[0];
              for (let i = 0; i < s.length; i++) {
                max = s[i].startPosition.isAfter(max.startPosition) ? s[i] : max;
              }
              for (let i of this.symbols) {
                if (
                  i.name === max.name &&
                  i.startPosition.isEqual(max.startPosition) &&
                  i.type === max.type
                ) {
                  i.setEndPosition(endPosition.line);
                  break;
                }
              }
            }
          }
        }
        this.isDirty = false;
      }
    } catch (e) {
      this.logger.error((e as Error).toString());
    }
  }

  async index(): Promise<void> {
    this.logger.info('indexing ', this.doc.uri.fsPath);
    let output = await this.execCtags(this.doc.uri.fsPath);
    await this.buildSymbolsList(output);
  }
}

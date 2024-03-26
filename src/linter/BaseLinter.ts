// SPDX-License-Identifier: MIT
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '../logger';
import { getWorkspaceFolder } from '../utils';

export default abstract class BaseLinter {
  protected diagnosticCollection: vscode.DiagnosticCollection;
  name: string;
  protected logger: Logger;

  constructor(name: string, diagnosticCollection: vscode.DiagnosticCollection, logger: Logger) {
    this.diagnosticCollection = diagnosticCollection;
    this.name = name;
    this.logger = logger;
  }

  // returns absolute path
  protected resolvePath(inputPath: string): string {
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    let wspath = getWorkspaceFolder();
    if (wspath === undefined) {
      return inputPath;
    }
    return path.join(wspath, inputPath);
  }

  public startLint(doc: vscode.TextDocument) {
    this.lint(doc);
  }

  public removeFileDiagnostics(doc: vscode.TextDocument) {
    this.diagnosticCollection.delete(doc.uri);
  }

  protected abstract convertToSeverity(severityString: string): vscode.DiagnosticSeverity;
  protected abstract lint(doc: vscode.TextDocument): void;
}

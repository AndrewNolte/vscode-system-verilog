// SPDX-License-Identifier: MIT
import * as vscode from 'vscode';
import { Logger } from '../logger';
import BaseLinter from './BaseLinter';
import IcarusLinter from './IcarusLinter';
import ModelsimLinter from './ModelsimLinter';
import SlangLinter from './SlangLinter';
import VerilatorLinter from './VerilatorLinter';
import XvlogLinter from './XvlogLinter';

export default class LintManager {
  private linter: BaseLinter | null;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private logger: Logger;

  constructor(logger: Logger) {
    this.linter = null;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
    this.logger = logger;

    this.configLinter();

    // Run linting for open documents on launch
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint(editor.document);
    });
  }

  getLinterFromString(name: string): BaseLinter | null {
    switch (name) {
      case 'iverilog':
        return new IcarusLinter(this.diagnosticCollection, this.logger.getChild('IcarusLinter'));
      case 'xvlog':
        return new XvlogLinter(this.diagnosticCollection, this.logger.getChild('XvlogLinter'));
      case 'modelsim':
        return new ModelsimLinter(
          this.diagnosticCollection,
          this.logger.getChild('ModelsimLinter')
        );
      case 'verilator':
        return new VerilatorLinter(
          this.diagnosticCollection,
          this.logger.getChild('VerilatorLinter')
        );
      case 'slang':
        return new SlangLinter(this.diagnosticCollection, this.logger.getChild('SlangLinter'));
      default:
        return null;
    }
  }

  configLinter() {
    let linterName = vscode.workspace.getConfiguration('verilog.linting').get<string>('linter');

    if (this.linter !== null) {
      if (this.linter.name === linterName) {
        return;
      }
    }
    if (linterName === undefined) {
      this.logger.warn('linterName is undefined');
      return;
    }

    this.linter = this.getLinterFromString(linterName);
    if (this.linter === null) {
      this.logger.warn('Invalid linter name: ' + linterName);
      return;
    }

    this.logger.info('Using linter: ' + this.linter.name);
  }

  lint(doc: vscode.TextDocument) {
    if (this.linter === null) {
      return;
    }
    switch (doc.languageId) {
      case 'verilog':
      case 'systemverilog':
        this.linter.startLint(doc);
        break;
      default:
        break;
    }
  }

  removeFileDiagnostics(doc: vscode.TextDocument) {
    if (this.linter === null) {
      return;
    }
    this.linter.removeFileDiagnostics(doc);
  }

  async runLintTool() {
    // Check for language id
    this.logger.info('Executing runLintTool()');
    let lang: string | undefined = vscode.window.activeTextEditor?.document.languageId;
    if (
      vscode.window.activeTextEditor === undefined ||
      (lang !== 'verilog' && lang !== 'systemverilog')
    ) {
      vscode.window.showErrorMessage('Verilog-HDL/SystemVerilog: No document opened');
      return;
    }

    let linterPick: vscode.QuickPickItem | undefined = await vscode.window.showQuickPick(
      [
        {
          label: 'iverilog',
          description: 'Icarus Verilog',
        },
        {
          label: 'xvlog',
          description: 'Vivado Logical Simulator',
        },
        {
          label: 'modelsim',
          description: 'Modelsim',
        },
        {
          label: 'verilator',
          description: 'Verilator',
        },
        {
          label: 'slang',
          description: 'Slang',
        },
      ],
      {
        matchOnDescription: true,
        placeHolder: 'Choose a linter to run',
      }
    );
    if (linterPick === undefined) {
      this.logger.error('linterStr is undefined');
      return;
    }
    let chosenLinter: vscode.QuickPickItem = linterPick;
    // Create and run the linter with progress bar
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Verilog-HDL/SystemVerilog: Running lint tool...',
      },
      async (_progress, _token) => {
        let linter: BaseLinter | null = this.getLinterFromString(chosenLinter.label);
        if (linter === null) {
          this.logger.error('Cannot find linter name: ' + chosenLinter.label);
          return;
        }
        this.logger.info('Using ' + linter.name + ' linter');

        if (vscode.window.activeTextEditor) {
          linter.removeFileDiagnostics(vscode.window.activeTextEditor.document);
        }
        if (vscode.window.activeTextEditor) {
          linter.startLint(vscode.window.activeTextEditor.document);
        }
      }
    );
  }
}

// SPDX-License-Identifier: MIT
import * as vscode from 'vscode';
import { Logger } from '../logger';
import BaseLinter from './BaseLinter';
import IcarusLinter from './IcarusLinter';
import SlangLinter from './SlangLinter';
import { GeneralOptions } from './ToolOptions';
import VerilatorLinter from './VerilatorLinter';
import XvlogLinter from './XvlogLinter';

enum Linter {
  slang = 'slang',
  verilator = 'verilator',
  iverilog = 'iverilog',
  xvlog = 'xvlog',
  modelsim = 'modelsim',
}

export default class LintManager {
  private logger: Logger;
  private linters: Map<string, BaseLinter> = new Map();
  private generalConfig;

  constructor(logger: Logger) {
    this.logger = logger;

    this.generalConfig = new GeneralOptions();
    this.linters.set(Linter.slang, new SlangLinter(Linter.slang, this.logger, this.generalConfig));
    this.linters.set(
      Linter.iverilog,
      new IcarusLinter(Linter.iverilog, this.logger, this.generalConfig)
    );
    this.linters.set(
      Linter.verilator,
      new VerilatorLinter(Linter.verilator, this.logger, this.generalConfig)
    );
    this.linters.set(Linter.xvlog, new XvlogLinter(Linter.xvlog, this.logger, this.generalConfig));
    this.linters.set(
      Linter.modelsim,
      new XvlogLinter(Linter.xvlog, this.logger, this.generalConfig)
    );
    // Run linting for open documents on launch
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint(editor.document);
    });
  }

  async lint(doc: vscode.TextDocument) {
    switch (doc.languageId) {
      case 'verilog':
      case 'systemverilog':
        break;
      default:
        return;
    }
    let promises = Array.from(this.linters.values()).map((linter) => {
      return linter.lint(doc);
    });
    await Promise.all(promises);
  }

  removeFileDiagnostics(doc: vscode.TextDocument) {
    this.linters.forEach((linter) => {
      linter.clear(doc);
    });
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
        let linter: BaseLinter | undefined = this.linters.get(chosenLinter.label);
        if (linter === undefined) {
          this.logger.error('Cannot find linter name: ' + chosenLinter.label);
          return;
        }
        this.logger.info('Using ' + linter.name + ' linter');

        if (vscode.window.activeTextEditor) {
          linter.clear(vscode.window.activeTextEditor.document);
        }
        if (vscode.window.activeTextEditor) {
          linter.lint(vscode.window.activeTextEditor.document);
        }
      }
    );
  }
}

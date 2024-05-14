// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import IcarusLinter from './IcarusLinter'
import SlangLinter from './SlangLinter'
import VerilatorLinter from './VerilatorLinter'
import XvlogLinter from './XvlogLinter'
import ModelsimLinter from './ModelsimLinter'
import { ExtensionComponent } from '../lib/libconfig'

enum Linter {
  Slang = 'slang',
  Verilator = 'verilator',
  Iverilog = 'iverilog',
  Xvlog = 'xvlog',
  Modelsim = 'modelsim',
}

export default class LintManager extends ExtensionComponent {
  private linters: Map<string, BaseLinter> = new Map()

  slang: SlangLinter = new SlangLinter(Linter.Slang, true)
  modelsim: ModelsimLinter = new ModelsimLinter(Linter.Modelsim)
  iverilog: IcarusLinter = new IcarusLinter(Linter.Iverilog)
  verilator: VerilatorLinter = new VerilatorLinter(Linter.Verilator)
  xvlog: XvlogLinter = new XvlogLinter(Linter.Xvlog)

  constructor() {
    super()
    this.linters.set(Linter.Slang, this.slang)
    this.linters.set(Linter.Verilator, this.verilator)
    this.linters.set(Linter.Iverilog, this.iverilog)
    this.linters.set(Linter.Xvlog, this.xvlog)
    this.linters.set(Linter.Modelsim, this.modelsim)
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.logger.info('activating lint manager')
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.lint(editor.document)
        }
      })
    )
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(this.lint, this))
    context.subscriptions.push(
      vscode.workspace.onDidCloseTextDocument(this.removeFileDiagnostics, this)
    )
  }

  async lint(doc: vscode.TextDocument) {
    switch (doc.languageId) {
      case 'verilog':
      case 'systemverilog':
        break
      default:
        return
    }
    let promises = Array.from(this.linters.values()).map((linter) => {
      return linter.lint(doc)
    })
    await Promise.all(promises)
  }

  removeFileDiagnostics(doc: vscode.TextDocument) {
    this.linters.forEach((linter) => {
      linter.clear(doc)
    })
  }

  async runLintTool() {
    // Check for language id
    this.logger.info('Executing runLintTool()')
    let lang: string | undefined = vscode.window.activeTextEditor?.document.languageId
    if (
      vscode.window.activeTextEditor === undefined ||
      (lang !== 'verilog' && lang !== 'systemverilog')
    ) {
      this.showErrorMessage('No document opened')
      return
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
    )
    if (linterPick === undefined) {
      this.logger.error('linterStr is undefined')
      return
    }
    let chosenLinter: vscode.QuickPickItem = linterPick
    // Create and run the linter with progress bar
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Verilog: Running lint tool...',
      },
      async (_progress, _token) => {
        let linter: BaseLinter | undefined = this.linters.get(chosenLinter.label)
        if (linter === undefined) {
          this.logger.error('Cannot find linter name: ' + chosenLinter.label)
          return
        }
        this.logger.info('Using ' + linter.toolName + ' linter')

        if (vscode.window.activeTextEditor) {
          linter.clear(vscode.window.activeTextEditor.document)
        }
        if (vscode.window.activeTextEditor) {
          linter.lint(vscode.window.activeTextEditor.document)
        }
      }
    )
  }
}

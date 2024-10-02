// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { ExtensionComponent } from '../lib/libconfig'
import BaseLinter from './BaseLinter'
import IcarusLinter from './IcarusLinter'
import ModelsimLinter from './ModelsimLinter'
import SlangLinter from './SlangLinter'
import VerilatorLinter from './VerilatorLinter'
import XvlogLinter from './XvlogLinter'
import { isAnyVerilog } from '../utils'
import XceliumLinter from './XceliumLinter'

enum Linter {
  Slang = 'slang',
  Verilator = 'verilator',
  Iverilog = 'iverilog',
  Xvlog = 'xvlog', // Xilinx/Vivado
  Modelsim = 'modelsim', // Mentor Graphics
  Xcelium = 'xrun', // Cadence
  // Vcs = 'vcs', // synopsys - TODO
}

export default class LintManager extends ExtensionComponent {
  private linters: Map<string, BaseLinter> = new Map()

  slang: SlangLinter = new SlangLinter(Linter.Slang, true)
  modelsim: ModelsimLinter = new ModelsimLinter(Linter.Modelsim)
  iverilog: IcarusLinter = new IcarusLinter(Linter.Iverilog)
  verilator: VerilatorLinter = new VerilatorLinter(Linter.Verilator)
  xvlog: XvlogLinter = new XvlogLinter(Linter.Xvlog)
  xcelium: XceliumLinter = new XceliumLinter(Linter.Xcelium)

  constructor() {
    super()
    this.linters.set(Linter.Slang, this.slang)
    this.linters.set(Linter.Verilator, this.verilator)
    this.linters.set(Linter.Iverilog, this.iverilog)
    this.linters.set(Linter.Xvlog, this.xvlog)
    this.linters.set(Linter.Modelsim, this.modelsim)
    this.linters.set(Linter.Xcelium, this.xcelium)
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
    context.subscriptions.push(vscode.window.registerTerminalLinkProvider(this.xcelium))
  }

  async lint(doc: vscode.TextDocument) {
    if (!isAnyVerilog(doc.languageId)) {
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
}

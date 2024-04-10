// SPDX-License-Identifier: MIT
import * as process from 'process'
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import { FileDiagnostic } from './ToolOptions'

let isWindows = process.platform === 'win32'

export default class VerilatorLinter extends BaseLinter {
  protected convertToSeverity(severityString: string): vscode.DiagnosticSeverity {
    if (severityString.startsWith('Error')) {
      return vscode.DiagnosticSeverity.Error
    } else if (severityString.startsWith('Warning')) {
      return vscode.DiagnosticSeverity.Warning
    }
    return vscode.DiagnosticSeverity.Information
  }

  protected toolArgs(doc: vscode.TextDocument): string[] {
    let args = ['--lint-only']
    if (doc.languageId === 'systemverilog') {
      args.push('-sv')
    }
    return args
  }

  protected parseDiagnostics(args: { stdout: string; stderr: string }): FileDiagnostic[] {
    let diagnostics: FileDiagnostic[] = []
    args.stderr.split(/\r?\n/g).forEach((line, _) => {
      if (!line.startsWith('%')) {
        return
      }

      // alternate:
      // "%Error(-[A-Z0-9]+)?: ((\\S+):(\\d+):((\\d+):)? )?(.*)$",
      let rex = line.match(
        /%(\w+)(-[A-Z0-9_]+)?:(\S+)(\w+:)?(?:[^:]+):\s*(\d+):(?:\s*(\d+):)?\s*(\s*.+)/
      )

      if (!rex || rex[0].length === 0) {
        return
      }

      let warningType = rex[1]
      let file = rex[2]
      let lineNum = Number(rex[5]) - 1
      let colNum = Number(rex[6]) - 1
      let msg = rex[7]
      // Type of warning is in rex[2]
      colNum = isNaN(colNum) ? 0 : colNum // for older Verilator versions (< 4.030 ~ish)

      if (!isNaN(lineNum)) {
        diagnostics.push({
          file: file,
          severity: this.convertToSeverity(rex[2]),
          range: new vscode.Range(lineNum, colNum, lineNum, Number.MAX_VALUE),
          message: msg,
          code: warningType,
          source: 'verilator',
        })
      }
    })
    return diagnostics
  }
}

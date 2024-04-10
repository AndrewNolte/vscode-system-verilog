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
    // this.logger.info('stdout: ' + args.stdout)
    // this.logger.info('stderr: ' + args.stderr)
    // let lines = args.stderr.split(/\n/, 20)
    let lines = args.stderr.split(/\r?\n/g)
    for (let n = 0; n < lines.length; n++) {
      let line: string = lines[n]
      if (!line.startsWith('%')) {
        continue
      }

      // alternate:
      // "%Error(-[A-Z0-9]+)?: ((\\S+):(\\d+):((\\d+):)? )?(.*)$",
      let rex = line.match(/%(\w+)(-\w+)?: (\S+):(\d+):(\d+): (.+)/)

      if (!rex || rex[0].length === 0) {
        continue
      }
      let severity = rex[1]
      let warningType = rex[2] !== undefined ? rex[2].substring(1) : ''
      let file = rex[3]
      let lineNum = Number(rex[4]) - 1
      let colNum = Number(rex[5]) - 1
      let msg = rex[6]

      let pline = lines[n + 2]
      let pindex = pline.indexOf('^')
      let elen = pline.length - pindex
      n += 2
      /// right index

      if (!isNaN(lineNum)) {
        diagnostics.push({
          file: file,
          severity: this.convertToSeverity(severity),
          range: new vscode.Range(lineNum, colNum, lineNum, colNum + elen),
          message: msg,
          code: warningType,
          source: 'verilator',
        })
      }
    }
    return diagnostics
  }
}

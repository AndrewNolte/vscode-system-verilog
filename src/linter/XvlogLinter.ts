// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import { FileDiagnostic } from '../utils'

export default class XvlogLinter extends BaseLinter {
  protected toolArgs(doc: vscode.TextDocument): string[] {
    let args = ['-nolog']
    if (doc.languageId === 'systemverilog') {
      args.push('-sv')
    }
    return args
  }

  protected formatIncludes(includes: string[]): string[] {
    let ret = []
    for (let inc of includes) {
      ret.push('-i')
      ret.push(inc)
    }
    return ret
  }

  protected parseDiagnostics(args: {
    doc: vscode.TextDocument
    stdout: string
    stderr: string
  }): FileDiagnostic[] {
    let diagnostics: FileDiagnostic[] = []

    args.stdout.split(/\r?\n/g).forEach((line) => {
      let match = line.match(/^(ERROR|WARNING):\s+\[(VRFC\b[^\]]*)\]\s+(.*\S)\s+\[(.*):(\d+)\]\s*$/)
      if (!match) {
        return
      }

      // Get filename and line number
      let filename = match[4]
      let lineno = parseInt(match[5]) - 1

      let diagnostic: FileDiagnostic = {
        file: filename,
        severity:
          match[1] === 'ERROR'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        code: match[2],
        message: '[' + match[2] + '] ' + match[3],
        range: new vscode.Range(lineno, 0, lineno, Number.MAX_VALUE),
        source: 'xvlog',
      }

      diagnostics.push(diagnostic)
    })
    return diagnostics
  }
}

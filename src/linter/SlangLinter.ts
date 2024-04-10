// SPDX-License-Identifier: MIT
import * as process from 'process'
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import { FileDiagnostic } from './ToolOptions'

let isWindows = process.platform === 'win32'

export default class SlangLinter extends BaseLinter {
  protected convertToSeverity(severityString: string): vscode.DiagnosticSeverity {
    if (severityString.startsWith('error')) {
      return vscode.DiagnosticSeverity.Error
    } else if (severityString.startsWith('warning')) {
      return vscode.DiagnosticSeverity.Warning
    }
    return vscode.DiagnosticSeverity.Information
  }

  protected parseDiagnostics(args: { stdout: string; stderr: string }): FileDiagnostic[] {
    /// TODO: reuse tasks/problem matchers for this

    let diags: FileDiagnostic[] = []

    const re = /(.+?):(\d+):(\d+):\s(note|warning|error):\s(.*?)(\[-W(.*)\]|$)/
    args.stderr.split(/\r?\n/g).forEach((line, _) => {
      if (line.search(re) === -1) {
        return
      }

      let rex = line.match(re)
      if (rex === null) {
        return
      }

      if (!rex || rex[0].length === 0) {
        this.logger.warn('[slang] failed to parse error: ' + line)
        return
      }

      let filePath = this.wslAdjust(rex[1])
      let lineNum = Number(rex[2]) - 1
      let colNum = Number(rex[3]) - 1

      diags.push({
        file: filePath,
        severity: this.convertToSeverity(rex[4]),
        range: new vscode.Range(lineNum, colNum, lineNum, Number.MAX_VALUE),
        message: rex[5],
        code: rex[7] ? rex[7] : 'error',
        source: 'slang',
      })
    })

    return diags
  }
}

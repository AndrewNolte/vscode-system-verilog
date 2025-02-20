// SPDX-License-Identifier: MIT
import * as process from 'process'
import * as vscode from 'vscode'
import { FileDiagnostic } from '../utils'
import BaseLinter from './BaseLinter'

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

  protected parseDiagnostics(args: {
    doc: vscode.TextDocument
    stdout: string
    stderr: string
  }): FileDiagnostic[] {
    /// TODO: reuse tasks/problem matchers for this

    let diags: FileDiagnostic[] = []

    const re = /(.+?):(\d+):(\d+):\s(note|warning|error):\s(.*?)(\[-W(.*)\]|$)/
    let lines = args.stderr.split(/\r?\n/g)
    for (let n = 0; n < lines.length; n++) {
      let line = lines[n]
      if (line.search(re) === -1) {
        continue
      }

      let rex = line.match(re)
      if (rex === null) {
        continue
      }

      if (!rex || rex[0].length === 0) {
        this.logger.warn('[slang] failed to parse error: ' + line)
        continue
      }

      let filePath = rex[1]
      let lineNum = Number(rex[2]) - 1
      let colNum = Number(rex[3]) - 1
      // find range
      const rangeLine = lines[n + 2]
      let begin = colNum
      let end = rangeLine.length
      if (colNum === rangeLine.length - 1) {
        // 1 length range, get the closest word after (unknown macro, etc.)
        const textLine = lines[n + 1]
        end = 1 + colNum + textLine.slice(colNum + 1).search(/[^a-zA-Z0-9_]/g)
        if (end <= colNum + 1) {
          end = textLine.length
        }
      } else {
        // n length range, adjust for ~~~~^~~~ case
        begin = Math.min(colNum, rangeLine.indexOf('~'))
        // should never happen, but just to be safe
        if (begin === -1) {
          begin = colNum
        }
      }

      // find message, potentially getting instance
      let msg = rex[5]
      if (n + 3 < lines.length && lines[n + 3].startsWith('  in instance:')) {
        msg += '\n' + lines[n + 3]
        n++
      }
      n += 2

      let code = rex[7] ? rex[7] : 'error'

      let tags = []

      let severity = this.convertToSeverity(rex[4])

      if (code.startsWith("unused")) {
        tags.push(vscode.DiagnosticTag.Unnecessary)
        severity = vscode.DiagnosticSeverity.Hint
      }

      diags.push({
        file: filePath,
        severity: severity,
        range: new vscode.Range(
          new vscode.Position(lineNum, begin),
          new vscode.Position(lineNum, end)
        ),
        message: msg,
        code: code,
        source: 'slang',
        tags: tags
      })
    }

    return diags
  }
}

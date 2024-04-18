// SPDX-License-Identifier: MIT
import * as process from 'process'
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import { FileDiagnostic } from '../utils'

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

      let filePath = this.wslAdjust(rex[1])
      let lineNum = Number(rex[2]) - 1
      let colNum = Number(rex[3]) - 1

      let pline = lines[n + 2]
      let pindex = pline.indexOf('^')
      let elen = pline.length - pindex
      n += 2

      let spos = new vscode.Position(lineNum, colNum)
      let range = undefined
      if (elen === 1) {
        range = args.doc.getWordRangeAtPosition(spos.translate(0, 1))
      }
      if (range === undefined) {
        range = new vscode.Range(spos, new vscode.Position(lineNum, colNum + elen))
      }

      diags.push({
        file: filePath,
        severity: this.convertToSeverity(rex[4]),
        range: range,
        message: rex[5],
        code: rex[7] ? rex[7] : 'error',
        source: 'slang',
      })
    }

    return diags
  }
}

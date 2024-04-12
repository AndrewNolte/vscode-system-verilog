// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import { FileDiagnostic } from '../utils'
import { ConfigObject } from '../libconfig'

export default class ModelsimLinter extends BaseLinter {
  work: ConfigObject<string> = new ConfigObject({
    default: 'work',
    description: 'Modelsim work library',
  })
  protected toolArgs(_doc: vscode.TextDocument): string[] {
    let args = ['-nologo']
    args.push('-work')
    args.push(this.work.getValue())
    return args
  }

  protected convertToSeverity(severityString: string): vscode.DiagnosticSeverity {
    switch (severityString) {
      case 'Error':
        return vscode.DiagnosticSeverity.Error
      case 'Warning':
        return vscode.DiagnosticSeverity.Warning
    }
    return vscode.DiagnosticSeverity.Information
  }

  protected parseDiagnostics(args: { stdout: string; stderr: string }): FileDiagnostic[] {
    let diagnostics: FileDiagnostic[] = []
    let lines = args.stdout.split(/\r?\n/g)

    // ^\*\* (((Error)|(Warning))( \(suppressible\))?: )(\([a-z]+-[0-9]+\) )?([^\(]*\(([0-9]+)\): )(\([a-z]+-[0-9]+\) )?((((near|Unknown identifier|Undefined variable):? )?["']([\w:;\.]+)["'][ :.]*)?.*)
    // From https://github.com/dave2pi/SublimeLinter-contrib-vlog/blob/master/linter.py
    let regexExp =
      '^\\*\\* (((Error)|(Warning))( \\(suppressible\\))?: )(\\([a-z]+-[0-9]+\\) )?([^\\(]*)\\(([0-9]+)\\): (\\([a-z]+-[0-9]+\\) )?((((near|Unknown identifier|Undefined variable):? )?["\']([\\w:;\\.]+)["\'][ :.]*)?.*)'
    // Parse output lines
    lines.forEach((line: string, _: any) => {
      if (!line.startsWith('**')) {
        return
      }

      try {
        let m = line.match(regexExp)
        if (m === null) {
          return
        }
        let lineNum = parseInt(m[8]) - 1
        let msg = m[10]
        diagnostics.push({
          file: m[7],
          severity: this.convertToSeverity(m[2]),
          range: new vscode.Range(lineNum, 0, lineNum, Number.MAX_VALUE),
          message: msg,
          code: 'modelsim',
          source: 'modelsim',
        })
      } catch (e) {
        this.logger.error(`failed to parse line: ${line}`)
      }
    })
    return diagnostics
  }
}

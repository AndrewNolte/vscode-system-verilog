// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import BaseLinter from './BaseLinter'
import { FileDiagnostic, isSystemVerilog } from '../utils'
import { ext } from '../extension'

export default class VerilatorLinter extends BaseLinter {
  pkgs: Map<string, string[]>
  constructor(name: string) {
    super(name)

    this.pkgs = new Map<string, string[]>()
  }
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
    if (isSystemVerilog(doc.languageId)) {
      args.push('-sv')
    }
    return args
  }

  protected async lintInternal(doc: vscode.TextDocument): Promise<FileDiagnostic[]> {
    /// Verilator expects packages in a previous compilation, so add those here for the second run
    let addedPkgs = true
    let diags: FileDiagnostic[] = []
    let pkgs = this.pkgs.get(doc.uri.fsPath) ?? []
    while (addedPkgs) {
      addedPkgs = false
      let output: any = await this.runTool(doc, pkgs)
      diags = this.parseDiagnostics(output)
      for (let diag of diags) {
        if (diag.code === 'PKGNODECL') {
          const pattern = /'([^']+)'/
          const match = diag.message.match(pattern)
          if (match === null || match?.length < 2) {
            continue
          }
          let pkg = await ext.index.findModule(match[1])
          if (pkg) {
            if (!pkgs.includes(pkg.uri.fsPath)) {
              addedPkgs = true
              pkgs.unshift(pkg.uri.fsPath)
            }
          } else {
            this.logger.info("couldn't find package " + pkg)
          }
        }
      }
    }
    this.pkgs.set(doc.uri.fsPath, pkgs)
    return diags
  }

  protected parseDiagnostics(args: {
    doc: vscode.TextDocument
    stdout: string
    stderr: string
  }): FileDiagnostic[] {
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

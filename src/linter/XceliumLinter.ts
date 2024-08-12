// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { FileDiagnostic, isSystemVerilog } from '../utils'
import BaseLinter from './BaseLinter'
import { ext } from '../extension'

class VerilogFileLink extends vscode.TerminalLink {
  fileName: string
  position: vscode.Position
  constructor(fileName: string, position: vscode.Position, startIndex: number, length: number) {
    super(startIndex, length)
    this.fileName = fileName
    this.position = position
  }
}

export default class XceliumLinter
  extends BaseLinter
  implements vscode.TerminalLinkProvider<VerilogFileLink>
{
  // error code -> regex for extracting package name
  pkgDiags: Map<string, RegExp>
  constructor(name: string) {
    super(name)
    this.pkgDiags = new Map<string, RegExp>()
    this.pkgDiags.set('NOPBIND', /Package\s([\w_]+)\scould\snot\sbe\sbound\./)
    this.pkgDiags.set('ILLHIN', /illegal\slocation\sfor\sa\shierarchical\sname\s\(([\w_]+)\)\./)
  }

  provideTerminalLinks(
    context: vscode.TerminalLinkContext,
    _token: vscode.CancellationToken
  ): VerilogFileLink[] {
    // TODO: have this update diagnostics too?
    const re = /\((.*),(\d+)\|(\d+)\)/g
    let links: VerilogFileLink[] = []
    let match
    while ((match = re.exec(context.line)) !== null) {
      this.logger.info('found link', match)
      const filePath = match[1]
      const lineNum = Number(match[2]) - 1
      const colNum = Number(match[3]) - 1
      const link = new VerilogFileLink(
        filePath,
        new vscode.Position(lineNum, colNum),
        match.index,
        match[0].length
      )
      links.push(link)
    }
    return links
  }

  async handleTerminalLink(link: VerilogFileLink): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(link.fileName))
    await vscode.window.showTextDocument(doc, {
      preview: false,
      selection: new vscode.Range(link.position, link.position),
    })
  }

  protected toolArgs(doc: vscode.TextDocument): string[] {
    let args = ['-elaborate']
    if (isSystemVerilog(doc.languageId)) {
      args.push('+libext+.sv')
    }
    return args
  }

  protected convertToSeverity(severityString: string): vscode.DiagnosticSeverity {
    if (severityString.startsWith('E')) {
      return vscode.DiagnosticSeverity.Error
    } else if (severityString.startsWith('W')) {
      return vscode.DiagnosticSeverity.Warning
    }
    return vscode.DiagnosticSeverity.Information
  }

  protected formatIncludes(includes: string[]): string[] {
    let incs: string[] = []
    for (let inc of includes) {
      incs.push('-incdir ' + inc)
    }
    return incs
  }

  protected async makeAdjustments(targetKey: string, diags: FileDiagnostic[]): Promise<boolean> {
    let addedPkgs = false
    let pkgs = this.addArgs.get(targetKey) ?? []

    for (let diag of diags) {
      if (typeof diag.code !== 'string') {
        continue
      }
      let pkgName: string
      if (diag.code === 'SVNOTY') {
        // Syntactically this identifier appears to begin a datatype but it does not refer to a visible datatype in the current scope.
        // We need to get the pkg from the doc itself :/ (cmon Cadence)
        const doc = await vscode.workspace.openTextDocument(diag.file)
        pkgName = doc.getText(diag.range)
      } else {
        const pattern: RegExp | undefined = this.pkgDiags.get(diag.code)
        if (pattern === undefined) {
          continue
        }
        const match = diag.message.match(pattern)
        if (match === null || match?.length < 2) {
          continue
        }
        pkgName = match[1]
      }
      const pkgFile = await ext.index.findModule(pkgName)
      if (pkgFile === undefined) {
        this.logger.info("couldn't find package " + pkgName)
        continue
      }
      const pkg: string = pkgFile.uri.fsPath

      // move or insert to the front of the list
      let ind = pkgs.indexOf(pkg)
      if (ind > 0) {
        // move to front
        pkgs.splice(ind, 1)
        pkgs.unshift(pkg)
        addedPkgs = true
      } else if (ind === -1) {
        // pkg not there
        pkgs.unshift(pkg)
        addedPkgs = true
      }
      // pkg already at front if ind == 0, don't want to go into infinite loop
    }

    this.addArgs.set(targetKey, pkgs)
    return addedPkgs
  }

  protected parseDiagnostics(args: {
    doc: vscode.TextDocument
    stdout: string
    stderr: string
  }): FileDiagnostic[] {
    let diags: FileDiagnostic[] = []
    const re = /(.+?):\s\*(\w+),(\w+)\s\(([^,]+),(\d+)\|(\d+)\):\s(.*)$/
    let lines = args.stdout.split(/\r?\n/g)
    for (let n = 0; n < lines.length; n++) {
      console.log('testing', lines[n])
      let line = lines[n]

      let rex = line.match(re)
      if (rex === null) {
        continue
      }
      console.log(rex)

      if (!rex || rex[0].length === 0) {
        this.logger.warn('[xcelium] failed to parse error: ' + line)
        continue
      }

      let filePath = rex[4]
      if (filePath.startsWith('./')) {
        filePath = filePath.substring(2)
      }
      let lineNum = Number(rex[5]) - 1
      let colNum = Number(rex[6]) - 1

      // just get the word at the column position
      let spos = new vscode.Position(lineNum, colNum)
      const range =
        args.doc.getWordRangeAtPosition(spos) ?? new vscode.Range(spos, spos.translate(0, 1000))

      diags.push({
        file: filePath,
        severity: this.convertToSeverity(rex[2]),
        range: range,
        message: rex[7],
        code: rex[3],
        source: 'xrun',
      })
    }

    this.logger.info(`found ${diags.length} errors in ${args.doc.uri.fsPath}`)

    return diags
  }
}

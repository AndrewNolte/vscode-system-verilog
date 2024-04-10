// SPDX-License-Identifier: MIT
import * as child from 'child_process'
import { ExecException } from 'child_process'
import * as path from 'path'
import * as process from 'process'
import * as vscode from 'vscode'
import { Logger } from '../logger'
import { getAbsPath, getWorkspaceFolder, getWslPath } from '../utils'
import { FileDiagnostic, GeneralOptions, LinterOptions } from './ToolOptions'
let isWindows = process.platform === 'win32'

export default abstract class BaseLinter {
  name: string
  protected logger: Logger
  protected generalOptions: GeneralOptions
  protected linterOptions: LinterOptions
  protected diagnostics: vscode.DiagnosticCollection

  constructor(name: string, parentLogger: Logger, generalOptions: GeneralOptions) {
    this.name = name
    this.logger = parentLogger.getChild(this.name)
    this.generalOptions = generalOptions
    this.linterOptions = new LinterOptions(this.name)
    this.diagnostics = vscode.languages.createDiagnosticCollection(this.name)

    vscode.workspace.onDidChangeConfiguration((ev) => {
      this.updateConfig()
    })
    this.updateConfig()
  }

  private getSubConfig<T>(attr: string, defaultValue: T): T {
    return (
      vscode.workspace.getConfiguration().get(`verilog.lint.${this.name}.${attr}`) ?? defaultValue
    )
  }
  private updateConfig() {
    this.linterOptions.enabled = this.getSubConfig('enabled', false)
    this.linterOptions.includes = this.getSubConfig('includes', this.generalOptions.includes)
    if (this.linterOptions.includes.length === 0) {
      this.linterOptions.includes = this.generalOptions.includes
    }
    this.logger.info('general includes: ' + this.generalOptions.includes)
    this.linterOptions.includes.forEach((inc) => {
      if (inc === '${includes}') {
        this.linterOptions.includes = this.linterOptions.includes
          .filter((inc) => inc !== '${includes}')
          .concat(this.generalOptions.includes)
      }
    })
    this.logger.info('specific includes: ' + this.linterOptions.includes)
    this.linterOptions.args = this.getSubConfig('args', '')
    this.linterOptions.useWsl = this.getSubConfig('useWsl', false)
    this.linterOptions.path = this.getSubConfig('path', this.name)
  }

  async lint(doc: vscode.TextDocument): Promise<void> {
    this.updateConfig()
    if (!this.linterOptions.enabled) {
      return
    }
    this.logger.info(`linting ${doc.uri}...`)
    let output = await this.runTool(doc)
    let diags = this.parseDiagnostics(output)
    this.diagnostics.set(
      doc.uri,
      diags.filter((diag) => {
        return doc.uri.fsPath.endsWith(diag.file)
      })
    )
    this.logger.info(
      `found ${this.diagnostics.get(doc.uri)?.length}/${diags.length} errors in ${doc.uri}`
    )
  }

  clear(doc: vscode.TextDocument) {
    this.diagnostics.set(doc.uri, [])
  }

  protected wslAdjust(path: string): string {
    if (isWindows) {
      if (this.linterOptions.useWsl) {
        return getWslPath(path)
      } else {
        return path.replace(/\\/g, '/')
      }
    }
    return path
  }

  protected async runTool(doc: vscode.TextDocument): Promise<{
    stdout: string
    stderr: string
  }> {
    let docUri: string = this.wslAdjust(doc.uri.fsPath)
    let docFolder: string = this.wslAdjust(path.dirname(docUri))

    let args: string[] = []
    args.push(...this.toolArgs(doc))
    args.push(this.formatIncludes([docFolder].concat(this.linterOptions.includes)))
    args.push(this.linterOptions.args)
    args.push(`"${docUri}"`)
    let command: string = this.linterOptions.path + ' ' + args.join(' ')

    let cwd: string | undefined = getWorkspaceFolder()

    if (this.generalOptions.runAtFileLocation) {
      if (isWindows) {
        cwd = path.dirname(docUri)
      } else {
        cwd = docFolder
      }
    }

    this.logger.info('Execute')
    this.logger.info('  command: ' + command)
    this.logger.info('  cwd    : ' + cwd)

    return new Promise((resolve, _reject) => {
      child.exec(
        command,
        { cwd: cwd },
        (error: ExecException | null, stdout: string, stderr: string) => {
          if (error !== null) {
            this.logger.error(error.toString())
          }
          resolve({ stdout, stderr })
        }
      )
    })
  }

  protected formatIncludes(includes: string[]): string {
    return includes.map((path: string) => ` -I"${getAbsPath(path)}" `).join(' ')
  }

  protected toolArgs(_doc: vscode.TextDocument): string[] {
    return []
  }

  protected abstract parseDiagnostics(args: { stdout: string; stderr: string }): FileDiagnostic[]
}

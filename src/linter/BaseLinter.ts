// SPDX-License-Identifier: MIT
import * as child from 'child_process'
import { ExecException } from 'child_process'
import * as path from 'path'
import * as process from 'process'
import * as vscode from 'vscode'
import { FileDiagnostic, getAbsPath, getWorkspaceFolder, getWslPath } from '../utils'
import { ConfigNode, ConfigObject } from '../libconfig'
import { ToolConfig } from '../runner'
import { config } from '../extension'
let isWindows = process.platform === 'win32'

export default abstract class BaseLinter extends ToolConfig {
  protected diagnostics: vscode.DiagnosticCollection

  enabled: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Enable this lint tool',
  })
  includes: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Include Path Overrides. Use `${includes} to include default includes',
  })

  includeComputed: string[] = []

  constructor(name: string) {
    super(name)
    this.diagnostics = vscode.languages.createDiagnosticCollection(this.toolName)
    this.includeComputed = []
  }

  // Override
  async configUpdated() {
    super.configUpdated()
    // We want to cache these values so we don't fetch every lint cycle
    this.logger.info('linter config updated')
    this.enabled.getValue()

    this.includeComputed = this.includes.getValue()
    this.includeComputed.forEach((inc: string) => {
      if (inc === '${includes}') {
        this.includeComputed = this.includeComputed
          .filter((inc) => inc !== '${includes}')
          .concat(config.includes.getValue())
      }
    })
    if (this.includeComputed.length === 0) {
      this.includeComputed = config.includes.getValue()
    }

    this.useWsl.getValue()
    this.path.getValue()
    this.args.getValue()
    this.runAtFileLocation.getValue()
  }

  async lint(doc: vscode.TextDocument): Promise<void> {
    this.logger.info('attempting to lint ' + doc.uri.fsPath)
    if (this.enabled.cachedValue !== true) {
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
      if (this.useWsl.cachedValue) {
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
    args.push(this.formatIncludes([docFolder].concat(this.includeComputed)))
    if (this.args.cachedValue !== undefined) {
      args.push(this.args.cachedValue)
    }
    args.push(`"${docUri}"`)
    let command: string = this.path.cachedValue + ' ' + args.join(' ')

    let cwd: string | undefined = getWorkspaceFolder()

    if (this.runAtFileLocation.cachedValue === true) {
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

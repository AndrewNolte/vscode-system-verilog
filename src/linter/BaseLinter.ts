// SPDX-License-Identifier: MIT
import * as child_process from 'child_process'
import * as path from 'path'
import * as process from 'process'
import * as vscode from 'vscode'
import { FileDiagnostic, getAbsPath, getWorkspaceFolder, getWslPath } from '../utils'
import { ConfigObject } from '../lib/libconfig'
import { ToolConfig } from '../lib/runner'
import { ext } from '../extension'
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

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.computeIncludes()
    context.subscriptions.push(
      this.onConfigUpdated(() => {
        this.diagnostics.clear()
        // We want to cache these values so we don't fetch every lint cycle
        this.logger.info('linter config updated')
        this.enabled.getValue()
        this.computeIncludes()

        this.useWsl.getValue()
        this.path.getValue()
        this.args.getValue()
        this.runAtFileLocation.getValue()
      })
    )
  }

  computeIncludes() {
    this.includeComputed = this.includes.getValue()
    this.includeComputed.forEach((inc: string) => {
      if (inc === '${includes}') {
        this.includeComputed = this.includeComputed
          .filter((inc) => inc !== '${includes}')
          .concat(ext.includes.getValue())
      }
    })
    if (this.includeComputed.length === 0) {
      this.includeComputed = ext.includes.getValue()
    }
  }

  async lint(doc: vscode.TextDocument): Promise<void> {
    if (this.enabled.cachedValue !== true) {
      return
    }
    this.logger.info(`linting ${doc.uri}...`)

    let diags = await this.lintInternal(doc)

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

  protected async lintInternal(doc: vscode.TextDocument): Promise<FileDiagnostic[]> {
    let output: any = await this.runTool(doc)
    return this.parseDiagnostics(output)
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

  protected async runTool(
    doc: vscode.TextDocument,
    addargs: string[] = []
  ): Promise<{
    stdout: string
    stderr: string
    doc: vscode.TextDocument
  }> {
    let docUri: string = this.wslAdjust(doc.uri.fsPath)
    let docFolder: string = this.wslAdjust(path.dirname(docUri))

    let args: string[] = []
    args.push(...this.toolArgs(doc))
    args.push(...this.formatIncludes([docFolder].concat(this.includeComputed)))
    if (this.args.cachedValue !== undefined) {
      args.push(
        ...this.args.cachedValue
          .trim()
          .split(' ')
          .map((arg) => arg.trim())
      )
    }

    if (ext.index.enableSymlinks.cachedValue) {
      args.push('-y')
      args.push('.sv_cache/files')
    }
    args.push(...addargs)

    args.push(docUri)

    let cwd: string | undefined = getWorkspaceFolder()

    if (this.runAtFileLocation.cachedValue === true) {
      if (isWindows) {
        cwd = path.dirname(docUri)
      } else {
        cwd = docFolder
      }
    }

    let command = this.path.cachedValue
    this.logger.info(`Running $${cwd}: ${command} ${args.join(' ')}`)

    return new Promise((resolve, _reject) => {
      child_process.execFile(
        command,
        args,
        { cwd: cwd, encoding: 'utf-8' },
        (error, stdout, stderr) => {
          if (error !== null) {
            this.logger.error(error.toString())
          }
          resolve({ stdout, stderr, doc })
        }
      )
    })
  }

  protected formatIncludes(includes: string[]): string[] {
    return includes.map((path: string) => `-I${getAbsPath(path)}`)
  }

  protected toolArgs(_doc: vscode.TextDocument): string[] {
    return []
  }

  protected abstract parseDiagnostics(args: {
    doc: vscode.TextDocument
    stdout: string
    stderr: string
  }): FileDiagnostic[]
}

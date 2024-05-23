// SPDX-License-Identifier: MIT
import * as child_process from 'child_process'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { ext, getCacheDir } from '../extension'
import { ConfigObject } from '../lib/libconfig'
import { ToolConfig } from '../lib/runner'
import { FileDiagnostic, getAbsPath, getWorkspaceFolder, getWorkspaceUri } from '../utils'

export default abstract class BaseLinter extends ToolConfig {
  protected diagnostics: vscode.DiagnosticCollection

  enabled: ConfigObject<boolean>
  includes: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Include Path Overrides. Use `${includes} to include default includes',
  })

  includeComputed: string[] = []
  isWsl: boolean = false
  indexDir: vscode.Uri | undefined = undefined

  constructor(name: string, defaultOn: boolean = false) {
    super(name)
    this.diagnostics = vscode.languages.createDiagnosticCollection(this.toolName)
    this.includeComputed = []
    this.enabled = new ConfigObject({
      default: defaultOn,
      description: 'Enable this lint tool',
    })
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.isWsl = vscode.env.shell.includes('wsl') || os.release().includes('Microsoft')

    this.computeIncludes()
    context.subscriptions.push(
      this.onConfigUpdated(async () => {
        await this.refreshConfg()
      })
    )
    this.refreshConfg()

    if (this.enabled.getValue()) {
      this.path.checkPathNotify()
    }
    this.indexDir = getCacheDir()
  }
  async refreshConfg() {
    this.diagnostics.clear()
    // We want to cache these values so we don't fetch every lint cycle
    this.logger.info('linter config updated')
    this.enabled.getValue()
    this.computeIncludes()

    this.args.getValue()
    this.runAtFileLocation.getValue()
    await this.path.getValueAsync()
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
    this.logger.info(`linting ${doc.uri}`)

    let diags = await this.lintInternal(doc)

    if (ext.project.top && getWorkspaceUri() !== undefined) {
      let wsUri: vscode.Uri = getWorkspaceUri()!
      let fmap = new Map<string, FileDiagnostic[]>()
      for (let diag of diags) {
        if (!fmap.has(diag.file)) {
          fmap.set(diag.file, [])
        }
        fmap.get(diag.file)?.push(diag)
        this.logger.info(diag.file)
      }
      this.diagnostics.clear()
      for (const [file, diagnostics] of fmap.entries()) {
        let uri: vscode.Uri
        if (!file.startsWith(wsUri.fsPath)) {
          uri = vscode.Uri.joinPath(wsUri, file)
        } else {
          uri = vscode.Uri.file(file)
        }
        this.diagnostics.set(uri, diagnostics)
        this.logger.info(`found ${diagnostics.length}/${diags.length} errors in ${uri.fsPath}`)
      }
    } else {
      this.diagnostics.set(
        doc.uri,
        diags.filter((diag) => {
          return doc.uri.fsPath.endsWith(diag.file)
        })
      )
      this.logger.info(
        `found ${this.diagnostics.get(doc.uri)?.length}/${diags.length} errors in ${doc.uri.fsPath}`
      )
    }
  }

  protected async lintInternal(doc: vscode.TextDocument): Promise<FileDiagnostic[]> {
    let output: any = await this.runTool(doc)
    return this.parseDiagnostics(output)
  }

  clear(doc: vscode.TextDocument) {
    this.diagnostics.set(doc.uri, [])
  }

  protected async runTool(
    doc: vscode.TextDocument,
    addargs: string[] = []
  ): Promise<{
    stdout: string
    stderr: string
    doc: vscode.TextDocument
  }> {
    let docPath: string = doc.uri.fsPath
    let docFolder: string = path.dirname(docPath)

    let args: string[] = []
    args.push(...this.toolArgs(doc))
    // -I folder + other includes
    args.push(...this.formatIncludes([docFolder].concat(this.includeComputed)))
    if (this.args.cachedValue !== '') {
      args.push(...this.args.cachedValue.trim().split(/\s+/))
    }
    if (ext.index.enableSymlinks.cachedValue && this.indexDir !== undefined) {
      args.push('-y')
      args.push(this.indexDir.fsPath)
    }
    args.push(...addargs)

    args.push(docPath)

    if (ext.project.top) {
      args.push(ext.project.top.doc.uri.fsPath)
    }

    let cwd: string | undefined = getWorkspaceFolder()
    if (this.runAtFileLocation.cachedValue === true) {
      cwd = docFolder
    }

    let command = this.path.cachedValue
    if (this.isWsl) {
      args.unshift(command)
      command = 'wsl'
    }

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

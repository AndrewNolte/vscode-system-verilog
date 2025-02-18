// SPDX-License-Identifier: MIT
import * as child_process from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as util from 'util'
import * as vscode from 'vscode'
import { ext } from '../extension'
import { ConfigObject } from '../lib/libconfig'
import { ToolConfig } from '../lib/runner'
import { FileDiagnostic, getAbsPath, getWorkspaceFolder, getWorkspaceUri } from '../utils'

const realpath = util.promisify(fs.realpath)

type ToolOutput = {
  stdout: string
  stderr: string
}

export default abstract class BaseLinter extends ToolConfig {
  protected diagnostics: vscode.DiagnosticCollection

  enabled: ConfigObject<boolean>
  projectEnabled: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Enable this linter only when the project is selected',
  })
  includes: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Include Path Overrides. Use `${includes} to include default includes',
  })

  includeComputed: string[] = []
  isWsl: boolean = false
  indexDir: vscode.Uri | undefined = undefined
  addArgs: Map<string, string[]>

  constructor(name: string, defaultOn: boolean = false) {
    super(name)
    this.diagnostics = vscode.languages.createDiagnosticCollection(this.toolName)
    this.includeComputed = []
    this.enabled = new ConfigObject({
      default: defaultOn,
      description: 'Enable this lint tool',
    })

    // target fsPath -> args
    this.addArgs = new Map<string, string[]>()
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.isWsl = vscode.env.shell.includes('wsl') || os.release().includes('Microsoft')

    this.computeIncludes()
    context.subscriptions.push(
      ext.onConfigUpdated(async () => {
        await this.refreshConfg()
      })
    )
    this.refreshConfg()

    if (this.enabled.getValue() || this.projectEnabled.getValue()) {
      await this.path.checkPathNotify()
    }
  }
  async refreshConfg() {
    this.diagnostics.clear()
    // We want to cache these values so we don't fetch every lint cycle
    this.logger.info('linter config updated')
    this.enabled.getValue()
    this.projectEnabled.getValue()
    this.computeIncludes()

    this.args.getValue()
    this.runAtFileLocation.getValue()
    this.indexDir = ext.index.cacheDir
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
      if (this.projectEnabled.cachedValue !== true || ext.project.top === undefined) {
        return
      }
    }
    if (this.path.cachedValue === '') {
      this.logger.warn(`skipping lint because tool is not found`)
      return
    }
    this.logger.info(`linting ${doc.uri}`)

    const targetUri = this.getTarget(doc.uri)

    // Run the tool, making adjustments if we can fix some missing pkgs, etc.
    let madeAdjustments = false
    let diags: FileDiagnostic[]
    let lintCount = 0 // safeguard against infinite looping
    do {
      const output: any = await this.runTool(doc)
      diags = this.parseDiagnostics({
        wsUri: getWorkspaceUri()!,
        doc: doc,
        stdout: output.stdout,
        stderr: output.stderr,
      })
      madeAdjustments = await this.makeAdjustments(targetUri.fsPath, diags)
      lintCount++
    } while (madeAdjustments && lintCount < 50)

    // parse project level errors if top is set
    if (ext.project.top && getWorkspaceUri() !== undefined) {
      let wsUri: vscode.Uri = getWorkspaceUri()!
      let fmap = new Map<string, FileDiagnostic[]>()
      for (let diag of diags) {
        if (!fmap.has(diag.file)) {
          fmap.set(diag.file, [])
        }
        fmap.get(diag.file)?.push(diag)
      }
      this.diagnostics.clear()
      this.logger.info('cleared diags')
      this.diagnostics.forEach((uri, diags) => {
        this.logger.info(`diags for ${uri.fsPath}: ${diags.length}`)
      })
      for (const [file, diagnostics] of fmap.entries()) {
        let uri: vscode.Uri
        if (file.includes('sv_cache')) {
          uri = vscode.Uri.joinPath(wsUri, file)
        } else if (!file.startsWith(wsUri.fsPath)) {
          // resolve symlink
          uri = ext.index.findModuleUri(file) ?? vscode.Uri.file(await realpath(file))
        } else {
          uri = vscode.Uri.file(file)
        }
        this.diagnostics.set(uri, diagnostics)
        this.logger.info(`found ${diagnostics.length}/${diags.length} errors in ${uri.fsPath}`)
      }
    } else {
      // parse errors in current file, ignoring others since this may be an invalid setting
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

  /// make adjustments to lint settings, based on diagnostics
  /// Typically adds missing packages or modules to path
  /// returns true if adjustments were made
  protected async makeAdjustments(_targetKey: string, _diags: FileDiagnostic[]): Promise<boolean> {
    return false
  }

  clear(doc: vscode.TextDocument) {
    this.diagnostics.set(doc.uri, [])
  }

  // make stdout/stderr types

  protected async runTool(doc: vscode.TextDocument): Promise<ToolOutput> {
    // Either current file or top module
    const targetUri = this.getTarget(doc.uri)
    let docFolder: string = path.dirname(targetUri.fsPath)

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

    // Additional flags needed for this target
    if (this.addArgs.has(targetUri.fsPath)) {
      args.push(...(this.addArgs.get(targetUri.fsPath) ?? []))
    }

    // top module
    args.push(targetUri.fsPath)

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
          resolve({ stdout, stderr })
        }
      )
    })
  }

  protected getTarget(currentUri: vscode.Uri): vscode.Uri {
    return ext.project.top ? ext.project.top.definition!.doc.uri : currentUri
  }

  protected formatIncludes(includes: string[]): string[] {
    return includes.map((path: string) => `+incdir+${getAbsPath(path)}`)
  }

  protected toolArgs(_doc: vscode.TextDocument): string[] {
    return []
  }

  protected abstract parseDiagnostics(args: {
    wsUri: vscode.Uri
    doc: vscode.TextDocument
    stdout: string
    stderr: string
  }): FileDiagnostic[]
}

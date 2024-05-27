// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'

import { SystemVerilogFormatProvider, VerilogFormatProvider } from './FormatProvider'
import { IndexComponent } from './IndexComponent'
import { LanguageServerComponent } from './LSComponent'
import { ProjectComponent } from './ProjectComponent'
import { CtagsComponent } from './analysis/CtagsComponent'
import { CtagsServerComponent } from './analysis/CtagsServerComponent'
import { selectModuleGlobal } from './analysis/selection'
import { ActivityBarComponent, CommandNode, ConfigObject } from './lib/libconfig'
import LintManager from './linter/LintManager'
import { SurferComponent } from './surferWaveformViewer'
import { getWorkspaceFolder } from './utils'

export var ext: VerilogExtension

export enum SvStandard {
  SV2005 = 'SystemVerilog-2005',
  SV2009 = 'SystemVerilog-2009',
  SV2012 = 'SystemVerilog-2012',
  SV2017 = 'SystemVerilog-2017',
  //   sv2023 = 'SystemVerilog2023',
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum VerilogStandard {
  V1995 = 'Verilog-95',
  V2001 = 'Verilog-2001',
  V2005 = 'Verilog-2005',
}

export class VerilogExtension extends ActivityBarComponent {
  /// Important components to load first
  index: IndexComponent = new IndexComponent()
  ctags: CtagsComponent = new CtagsComponent()

  ////////////////////////////////////////////////
  /// top level configs
  ////////////////////////////////////////////////
  includes: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Include paths to pass as -I to tools',
  })

  moduleGlobs: ConfigObject<string[]> = new ConfigObject({
    default: ['**/*.{sv,v}'],
    description:
      'Globs for finding verilog modules, interfaces, and packages for use with the common -y flag',
  })
  includeGlobs: ConfigObject<string[]> = new ConfigObject({
    default: ['**/*.{svh}'],
    description:
      'Globs for finding verilog include files (typically svh), used for definition providing. If set to [], it will source from verilog.includes',
  })
  excludeGlob: ConfigObject<string> = new ConfigObject({
    default: '',
    description: 'Globs to exclude files',
  })
  svStandard: ConfigObject<SvStandard> = new ConfigObject({
    default: SvStandard.SV2017,
    description: 'System Verilog standard to use',
    enum: Object.values(SvStandard),
  })
  verilogStandard: ConfigObject<VerilogStandard> = new ConfigObject({
    default: VerilogStandard.V2005,
    description: 'System Verilog standard to use',
    enum: Object.values(VerilogStandard),
  })
  formatDirs: ConfigObject<string[]> = new ConfigObject({
    default: [],
    description: 'Directories to format',
  })
  ////////////////////////////////////////////////
  /// extension subcomponents
  ////////////////////////////////////////////////
  lint: LintManager = new LintManager()

  svFormat: SystemVerilogFormatProvider = new SystemVerilogFormatProvider()
  verilogFormat: VerilogFormatProvider = new VerilogFormatProvider()

  project: ProjectComponent = new ProjectComponent()

  languageServer: LanguageServerComponent = new LanguageServerComponent()

  ctagsServer: CtagsServerComponent = new CtagsServerComponent()

  SurferComponent: SurferComponent = new SurferComponent()

  ////////////////////////////////////////////////
  /// top level commands
  ////////////////////////////////////////////////
  reindex: CommandNode = new CommandNode(
    {
      title: 'Reindex',
    },
    async () => {
      this.indexFiles(true)
        .then(() => {
          vscode.window.showInformationMessage('Reindexing complete')
        })
        .catch((err) => {
          vscode.window.showErrorMessage('Reindexing failed')
          this.logger.error(err)
        })
    }
  )

  instantiateModule: CommandNode = new CommandNode(
    {
      title: 'Instantiate Module',
    },
    async () => {
      let module = await selectModuleGlobal()
      if (module === undefined) {
        return
      }
      let ctags = ext.ctags.getCtags(module.doc)
      let snippet = ctags.getModuleSnippet(module, true)
      if (snippet === undefined) {
        return
      }
      vscode.window.activeTextEditor?.insertSnippet(snippet)
    }
  )

  async activate(context: vscode.ExtensionContext) {
    // Lets do this quickly
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint.lint(editor.document)
    })

    /////////////////////////////////////////////
    // Configure Format on save
    /////////////////////////////////////////////

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
        if (document.languageId === 'systemverilog' || document.languageId === 'verilog') {
          let dirs: string[] = this.formatDirs.getValue() ?? []
          for (let dir of dirs) {
            if (vscode.workspace.asRelativePath(document.uri.fsPath).startsWith(dir)) {
              this.logger.info('Formatting on save due to directory ' + dir)
              await vscode.commands.executeCommand('editor.action.formatDocument')
              await document.save()
              return
            }
          }
        }
      })
    )

    this.checkFormatDirs()
    this.onConfigUpdated(() => {
      this.checkFormatDirs()
    })

    /////////////////////////////////////////////
    // Slow async tasks
    /////////////////////////////////////////////

    // let ctags index include files

    let tasks = [this.indexFiles(), this.ctagsServer.loadBuiltins()]
    await Promise.all(tasks)

    this.logger.info(`${context.extension.id} activation finished.`)
  }

  private async checkFormatDirs() {
    let dirs = this.formatDirs.getValue()
    if (dirs.length > 0) {
      const svSave = vscode.workspace
        .getConfiguration('editor', { languageId: 'systemverilog' })
        .get('formatOnSave')
      const vSave = vscode.workspace
        .getConfiguration('editor', { languageId: 'verilog' })
        .get('formatOnSave')

      if (vSave || svSave) {
        vscode.window.showWarningMessage(
          'Both verilog.formatDirs and editor.formatOnSave are set, so formatDirs will be ignored.'
        )
      }
    }
  }

  private async indexFiles(reset: boolean = false) {
    if (!(await this.ctags.path.checkPathNotify())) {
      return
    }

    this.ctags
      .indexIncludes(reset)
      .then(() => {
        this.logger.info('ctags index includes finished')
      })
      .catch((err) => {
        this.logger.error('ctags index includes failed:')
        this.logger.error(err)
      })

    // index all files (symlinks in .sv_cache/files + in memory cache)
    this.index
      .indexFiles(reset)
      .then(() => {
        this.logger.info('index files finished')
      })
      .catch((err) => {
        this.logger.error('index files failed:')
        this.logger.error(err)
      })
  }

  public async findFiles(globs: string[]): Promise<vscode.Uri[]> {
    let ws = getWorkspaceFolder()
    if (ws === undefined) {
      return []
    }
    const exclude: string = this.excludeGlob.getValue()

    const find = async (str: string): Promise<vscode.Uri[]> => {
      let searchPattern = new vscode.RelativePattern(ws, str)
      let ret = await vscode.workspace.findFiles(searchPattern, exclude)
      return ret
    }
    let uriList: vscode.Uri[][] = await Promise.all(globs.map(find))
    let uris = uriList.reduce((acc, curr) => acc.concat(curr), [])
    return uris
  }

  public async findIncludes(): Promise<vscode.Uri[]> {
    let incGlobs = this.includeGlobs.getValue()
    if (incGlobs.length === 0) {
      incGlobs = this.includes.getValue().map((inc) => {
        return inc + '/*.svh'
      })
    }
    return await this.findFiles(incGlobs)
  }

  public async findModules(): Promise<vscode.Uri[]> {
    return await this.findFiles(this.moduleGlobs.getValue())
  }
}

export function deactivate(): Promise<void> {
  ext.logger.info('Deactivated')
  return ext.languageServer.stopAllLanguageClients()
}

export async function activate(context: vscode.ExtensionContext) {
  ext = new VerilogExtension({
    id: 'verilog',
    title: 'Verilog',
    icon: '$(chip)',
  })
  await ext.activateExtension('verilog', context, [
    'mshr-h.veriloghdl',
    'eirikpre.systemverilog',
    'IMCTradingBV.svlangserver',
    'surfer-project.surfer',
  ])
}

export function getCacheDir(): vscode.Uri | undefined {
  let ws = vscode.workspace.workspaceFolders?.[0]?.uri
  if (ws === undefined) {
    return undefined
  }
  return vscode.Uri.joinPath(ws, '.sv_cache', 'files')
}

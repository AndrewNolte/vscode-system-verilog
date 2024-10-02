// SPDX-License-Identifier: MIT
import { TextEncoder } from 'util'
import * as vscode from 'vscode'

import * as child_process from 'child_process'
import { glob } from 'glob'
import path from 'path'
import { promisify } from 'util'
import { CtagsComponent } from './analysis/CtagsComponent'
import { CtagsServerComponent } from './analysis/CtagsServerComponent'
import { selectModuleGlobal } from './analysis/ModuleSelection'
import { SystemVerilogFormatProvider, VerilogFormatProvider } from './FormatProvider'
import { IncludeConfig } from './IncludeConfig'
import { IndexComponent } from './IndexComponent'
import { InlayHintsComponent } from './InlayHintsComponent'
import {
  ActivityBarComponent,
  CommandNode,
  ConfigObject,
  EditorButton,
  ViewContainerSpec,
} from './lib/libconfig'
import LintManager from './linter/LintManager'
import { LanguageServerComponent } from './LSComponent'
import { ProjectComponent } from './sidebar/ProjectComponent'
import { SurferComponent } from './surferWaveformViewer'
import { getWorkspaceFolder, pathFilename, zip } from './utils'
const asyncGlob = promisify(glob)

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
  includes: IncludeConfig = new IncludeConfig({
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

  expandMacroScript: ConfigObject<string> = new ConfigObject({
    default: '',
    description: 'Script to expand macros. Takes the file as an argument, expects output on stdout',
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
  inlayHints: InlayHintsComponent = new InlayHintsComponent()

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

  fixModules: CommandNode = new CommandNode(
    {
      title: 'Fix file names to match module names',
    },
    async () => {
      /// Fix module file names to match the module name
      /// If a file has multiple modules, split into mutliple files
      /// keep excess text before and after the module definitions

      for (let uri of await this.findModules()) {
        const doc = await vscode.workspace.openTextDocument(uri)
        const verilogDoc = this.index.getVerilogDoc(doc)
        if (verilogDoc === undefined) {
          continue
        }
        const modules = (await verilogDoc.getSymbolTree()).filter(
          (sym) => sym.isModuleType() && sym.type !== 'class'
        )
        if (modules.length === 0) {
          continue
        }

        // exclude common top level modules names and file names
        const COMMON_TOP_LEVEL_MODULES = ['top', 'tb', 'tb_top', 'dut']
        const fileName = pathFilename(uri)
        if (COMMON_TOP_LEVEL_MODULES.some((c) => fileName.endsWith(c))) {
          continue
        }
        if (modules.some((m) => COMMON_TOP_LEVEL_MODULES.some((c) => m.name.endsWith(c)))) {
          continue
        }

        if (modules.length === 1) {
          if (fileName === modules[0].name) {
            continue
          }
          // no ports => testbench
          if (modules[0].children.filter((c) => c.type === 'port').length === 0) {
            return
          }
          const canonUri = vscode.Uri.joinPath(
            uri.with({ path: path.dirname(uri.fsPath) }),
            modules[0].name + path.extname(uri.fsPath)
          )
          // Move the module to a new file named after the module
          vscode.window.showInformationMessage(`Moving ${modules[0].name} to ${canonUri.fsPath}`)
          try {
            await vscode.workspace.fs.rename(uri, canonUri, { overwrite: false })
          } catch (e) {
            vscode.window.showWarningMessage(
              'Failed to rename ' + uri.fsPath + ' to ' + canonUri.fsPath + ': ' + e
            )
          }
          continue
        }

        // multiple modules, split into multiple files
        this.logger.info(`Found ${modules.length} modules in ${uri.fsPath}`)
        vscode.window.showInformationMessage(`Splitting ${uri.fsPath} into ${modules.length} files`)
        // create new URIs for each module
        const newUris = modules.map((module) =>
          vscode.Uri.joinPath(
            uri.with({ path: path.dirname(uri.fsPath) }),
            module.name + path.extname(uri.fsPath)
          )
        )

        // zip modules and newUris together
        for (const [module, newUri] of zip(modules, newUris)) {
          const ignoreModules = modules
            .filter((m) => m.name !== module.name)
            .map((m) => m.getFullRange())
            .reverse()
          // read doc, don't write line in bad symbols
          let text = doc.getText()
          for (let range of ignoreModules) {
            text = text.slice(0, doc.offsetAt(range.start)) + text.slice(doc.offsetAt(range.end))
          }
          const encoder = new TextEncoder()
          await vscode.workspace.fs.writeFile(newUri, encoder.encode(text))
        }
        // delete the original file if not in newUris
        if (!newUris.find((u) => u.fsPath === uri.fsPath)) {
          await vscode.workspace.fs.delete(uri)
        }
      }
      vscode.window.showInformationMessage('File name fix complete')
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
      const sym = await ext.index.findModuleSymbol(module.name)
      if (sym === undefined) {
        return
      }

      let snippet = sym.getModuleSnippet(true)
      if (snippet === undefined) {
        return
      }
      vscode.window.activeTextEditor?.insertSnippet(snippet)
    }
  )

  expandMacros: EditorButton = new EditorButton(
    {
      title: 'Expand Macros',
      shortTitle: 'Expand macros',
      languages: ['verilog', 'systemverilog'],
      icon: '$(open-preview)',
    },
    async () => {
      if (ext.expandMacroScript.getValue() === '') {
        vscode.window.showErrorMessage('`verilog.expandMacroScript` not provided')
        return
      }
      let doc = vscode.window.activeTextEditor?.document
      if (doc === undefined) {
        vscode.window.showErrorMessage('Open a verilog document to expand macros')
        return
      }
      let expDir = this.expandDir
      if (expDir === undefined) {
        return
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Expanding macros',
        },
        async (progress) => {
          progress.report({ increment: 0, message: 'Expanding macros' })
          let expanded = child_process.execSync(
            ext.expandMacroScript.getValue() + ' ' + doc.uri.fsPath,
            {
              cwd: getWorkspaceFolder(),
            }
          )

          let uri: vscode.Uri = vscode.Uri.joinPath(expDir, doc.uri.path.split('/').pop()!)
          await vscode.workspace.fs.writeFile(uri, expanded)
          await vscode.workspace.openTextDocument(uri)
          await vscode.commands.executeCommand('vscode.diff', uri, doc.uri)
        }
      )
    }
  )
  expandDir: vscode.Uri | undefined = undefined
  context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext, obj: ViewContainerSpec) {
    super(obj)
    this.context = context
  }

  async activate(context: vscode.ExtensionContext) {
    // Lets do this quickly
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.lint.lint(editor.document)
    })

    if (context.storageUri !== undefined) {
      this.expandDir = vscode.Uri.joinPath(context.storageUri, '.sv_cache', 'expanded')
    }

    /////////////////////////////////////////////
    // Configure Format on save
    /////////////////////////////////////////////

    this.onConfigUpdated(() => {
      this.checkFormatDirs()
    })
    await this.checkFormatDirs()

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
    this.svFormat.activateFormatter(dirs, ['sv', 'svh'], 'systemverilog')
    this.verilogFormat.activateFormatter(dirs, ['v', 'vh'], 'verilog')
  }

  private async indexFiles(reset: boolean = false) {
    if (!(await this.ctags.path.checkPathNotify())) {
      return
    }

    this.index
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
      let ret: vscode.Uri[]
      if (path.isAbsolute(str)) {
        ret = (await asyncGlob(str)).map((p) => vscode.Uri.file(p))
      } else {
        ret = await vscode.workspace.findFiles(new vscode.RelativePattern(ws, str), exclude)
      }
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
  ext = new VerilogExtension(context, {
    id: 'verilog',
    title: 'Verilog',
    icon: '$(chip)',
  })
  await ext.activateExtension('verilog', 'Verilog', context, [
    'mshr-h.veriloghdl',
    'eirikpre.systemverilog',
    'IMCTradingBV.svlangserver',
    'surfer-project.surfer',
  ])
}

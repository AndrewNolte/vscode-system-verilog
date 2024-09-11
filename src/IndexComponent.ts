// SPDX-License-Identifier: MIT
import * as vscode from 'vscode'
import { ext } from './extension'
import { ConfigObject, ExtensionComponent } from './lib/libconfig'
import fs = require('fs')
import path = require('path')

export class IndexComponent extends ExtensionComponent {
  public readonly moduleMap: Map<string, vscode.Uri> = new Map()

  enableSymlinks: ConfigObject<boolean> = new ConfigObject({
    default: true,
    description:
      'Enable creating file symlinks in .sv_cache/files for the -y flag that most tools have. Created in a per-workspace exteneral directory that vscode provides',
  })

  cacheDir: vscode.Uri | undefined

  async activate(context: vscode.ExtensionContext): Promise<void> {
    this.logger.info('index activating')
    if (context.storageUri !== undefined) {
      this.cacheDir = vscode.Uri.joinPath(context.storageUri, '.sv_cache', 'files')
    }

    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc: vscode.TextDocument) => {
        this.indexFile(doc.uri)
      })
    )
    context.subscriptions.push(
      vscode.workspace.onDidRenameFiles((e) => {
        e.files.forEach((file) => {
          this.indexFile(file.newUri)
        })
      })
    )

    this.onConfigUpdated(() => {
      this.indexFiles()
    })
  }

  async getDir(reset: boolean = false): Promise<vscode.Uri | undefined> {
    if (this.cacheDir === undefined) {
      return undefined
    }
    if (!fs.existsSync(this.cacheDir.fsPath)) {
      fs.mkdirSync(this.cacheDir.fsPath, { recursive: true })
    } else if (reset) {
      await vscode.workspace.fs.delete(this.cacheDir, { recursive: true })
      fs.mkdirSync(this.cacheDir.fsPath, { recursive: true })
    }
    return this.cacheDir
  }
  indexMem(uri: vscode.Uri) {
    // modulemap
    let name = uri.path.split('/').pop()?.split('.').shift() ?? ''
    this.moduleMap.set(name, uri)
  }

  async indexSym(dir: vscode.Uri, uri: vscode.Uri) {
    // symlink
    let sym = path.join(dir.fsPath, path.basename(uri.fsPath))
    if (fs.existsSync(sym)) {
      return
    }
    try {
      await fs.promises.symlink(uri.fsPath, sym)
    } catch (e) {
      // sometimes existsSync doesn't catch it
      // this.logger.warn(`Failed to create symlink ${sym} -> ${uri.fsPath}`)
      // this.logger.warn(`Error message: ${e}`)
    }
  }

  indexFile(uri: vscode.Uri) {
    this.indexMem(uri)
    if (this.enableSymlinks.getValue() && this.cacheDir !== undefined) {
      this.indexSym(this.cacheDir, uri)
    }
  }

  async findModule(moduleName: string): Promise<vscode.TextDocument | undefined> {
    let file = this.moduleMap.get(moduleName)
    if (file === undefined) {
      return undefined
    }
    return await vscode.workspace.openTextDocument(file)
  }

  findModuleUri(path: string): vscode.Uri | undefined {
    let name = path.split('/').pop()?.split('.').shift() ?? ''
    return this.moduleMap.get(name)
  }

  async indexFiles(reset: boolean = false): Promise<void> {
    let dir = await this.getDir(reset)
    if (dir === undefined) {
      return
    }

    let files: vscode.Uri[] = await ext.findModules()
    this.logger.info('indexing ' + files.length + ' files')

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'Indexing Verilog files',
        cancellable: true,
      },
      async () => {
        for (let file of files) {
          this.indexMem(file)
        }
        if (this.enableSymlinks.getValue() && dir !== undefined) {
          let promises = files.map((file) => {
            this.indexSym(dir, file)
          })
          await Promise.all(promises)
        }
      }
    )
  }
}

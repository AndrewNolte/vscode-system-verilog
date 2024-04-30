// SPDX-License-Identifier: MIT
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { Symbol } from './ctagsParser'
import { getWorkspaceFolder } from '../utils'
import { Logger } from '../lib/logger'
import { ext } from '../extension'

export class CommandExcecutor {
  private logger: Logger
  constructor(logger: Logger) {
    this.logger = logger
  }

  async instantiateModuleInteract() {
    if (vscode.window.activeTextEditor === undefined) {
      return
    }
    let srcPath = await selectFile(path.dirname(vscode.window.activeTextEditor.document.fileName))
    if (srcPath === undefined) {
      return
    }
    let doc = await vscode.workspace.openTextDocument(srcPath)
    let ctags = ext.ctags.getCtags(doc)

    let modules: Symbol[] = await ctags.getModules()
    // No modules found
    if (modules.length <= 0) {
      ext.showErrorMessage('No modules found in the file')
      return undefined
    }
    let module: Symbol = modules[0]
    if (modules.length > 1) {
      let moduleName = await vscode.window.showQuickPick(
        modules.map((sym) => sym.name),
        {
          placeHolder: 'Choose a module to instantiate',
        }
      )
      if (moduleName === undefined) {
        return undefined
      }
      module = modules.filter((tag) => tag.name === moduleName)[0]
    }
    let snippet = ctags.getModuleSnippet(module, true)
    if (snippet === undefined) {
      return
    }
    vscode.window.activeTextEditor?.insertSnippet(snippet)
  }
}

async function selectFile(currentDir?: string): Promise<string | undefined> {
  currentDir = currentDir || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (currentDir === undefined) {
    return undefined
  }

  let dirs = getDirectories(currentDir)
  // if is subdirectory, add '../'
  if (currentDir !== getWorkspaceFolder()) {
    dirs.unshift('..')
  }
  // all files ends with '.sv'
  let files = getFiles(currentDir).filter((file) => file.endsWith('.v') || file.endsWith('.sv'))

  // available quick pick items
  // Indicate folders in the Quick pick
  let items: vscode.QuickPickItem[] = []
  dirs.forEach((dir) => {
    items.push({
      label: dir,
      description: 'folder',
    })
  })
  files.forEach((file) => {
    items.push({
      label: file,
    })
  })

  let selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Choose the module file',
  })
  if (!selected) {
    return undefined
  }

  // if is a directory
  let location = path.join(currentDir, selected.label)
  if (fs.statSync(location).isDirectory()) {
    return selectFile(location)
  }

  // return file path
  return location
}

function getDirectories(srcpath: string): string[] {
  return fs
    .readdirSync(srcpath)
    .filter((file) => fs.statSync(path.join(srcpath, file)).isDirectory())
}

function getFiles(srcpath: string): string[] {
  return fs.readdirSync(srcpath).filter((file) => fs.statSync(path.join(srcpath, file)).isFile())
}

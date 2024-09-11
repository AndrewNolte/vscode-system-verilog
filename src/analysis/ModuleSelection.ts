import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { ext } from '../extension'
import { getWorkspaceFolder } from '../utils'
import { Symbol } from './Symbol'

export async function selectModule(doc: vscode.TextDocument): Promise<Symbol | undefined> {
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
  return module
}

export async function selectModuleGlobal(): Promise<Symbol | undefined> {
  if (vscode.window.activeTextEditor === undefined) {
    return undefined
  }
  let srcPath = await selectFile(path.dirname(vscode.window.activeTextEditor.document.fileName))
  if (srcPath === undefined) {
    return undefined
  }
  let doc = await vscode.workspace.openTextDocument(srcPath)
  return await selectModule(doc)
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

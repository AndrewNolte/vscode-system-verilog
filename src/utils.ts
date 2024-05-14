import * as child_process from 'child_process'
import * as path from 'path'
import * as vscode from 'vscode'

export function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? undefined
}

export function getWorkspaceUri(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri
}

export function getPrevChar(
  document: vscode.TextDocument,
  start: vscode.Position
): string | undefined {
  const lineText = document.lineAt(start.line).text
  if (start.character === 0) {
    return undefined
  }
  return lineText.charAt(start.character - 1)
}

export function getPrev2Char(
  document: vscode.TextDocument,
  pos: vscode.Position
): string | undefined {
  const lineText = document.lineAt(pos.line).text
  if (pos.character <= 1) {
    return undefined
  }
  return lineText.charAt(pos.character - 2)
}

export function getParentText(document: vscode.TextDocument, textRange: vscode.Range): string {
  let range = textRange
  let prevChar = getPrevChar(document, textRange.start)
  if (prevChar === '.') {
    // follow interface.modport
    range = document.getWordRangeAtPosition(range.start.translate(0, -1)) ?? range

    // follow interface array refs
    let line = document.lineAt(textRange.start.line).text
    if (getPrev2Char(document, range.start) === ']') {
      let match = line.lastIndexOf('[', range.start.character - 2)
      range =
        document.getWordRangeAtPosition(new vscode.Position(range.start.line, match - 1)) ?? range
    }
  } else if (prevChar === ':' && range.start.character > 1) {
    // follow package scope all the way
    //use for loop to avoid risk of infinite loop
    for (let i = 0; i < 10 && prevChar === ':'; i++) {
      range = document.getWordRangeAtPosition(range.start.translate(0, -2)) ?? range
      prevChar = getPrevChar(document, range.start)
    }
  }
  return document.getText(range)
}

function filterPromise<T>(promise: Promise<Array<T>>): Promise<Array<T>> {
  return new Promise((resolve, reject) => {
    promise
      .then((value) => {
        if (value.length > 0) {
          resolve(value) // Resolve only if value is valid
        }
        // If the value is not valid, do not resolve or reject,
        // effectively taking this promise out of the race.
      })
      .catch(reject) // Propagate rejection
  })
}

export function raceArrays<T>(promises: Array<Promise<Array<T>>>): Promise<Array<T>> {
  return Promise.race(promises.map(filterPromise))
}

// wspath -> abs path
export function getAbsPath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath
  }
  let wspath = getWorkspaceFolder()
  if (wspath === undefined) {
    return inputPath
  }
  return path.join(wspath, inputPath)
}

export function getWslPath(inputPath: string): string {
  let cmd: string = `wsl wslpath '${inputPath}'`
  return child_process.execSync(cmd, {}).toString().replace(/\r?\n/g, '')
}

export class FileDiagnostic extends vscode.Diagnostic {
  file: string
  constructor(
    file: string,
    range: vscode.Range,
    message: string,
    severity?: vscode.DiagnosticSeverity
  ) {
    super(range, message, severity)
    this.file = file
  }
}

// end position in line
// getWordRanges(
//   doc: vscode.TextDocument,
//   endpos: vscode.Position
//   // token: vscode.CancellationToken
// ): vscode.Range[] {
//   let line = endpos.line
//   let pos = new vscode.Position(line, 0)
//   let ranges = []
//   while (pos.character < endpos.character) {
//     // let hover = await this.provideHover(doc, new vscode.Position(pos.line, x), token);
//     let range = doc.getWordRangeAtPosition(pos)
//     if (range !== undefined) {
//       ranges.push(range)
//       pos = range.end.translate(0, 1)
//     } else {
//       pos = pos.translate(0, 1)
//     }
//     pos = pos.translate(0, pos.character + 1)
//   }

//   return ranges
// }

import * as vscode from 'vscode';

export function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? undefined;
}

export function getPrevChar(
  document: vscode.TextDocument,
  range: vscode.Range
): string | undefined {
  const lineText = document.lineAt(range.start.line).text;
  if (range.start.character === 0) {
    return undefined;
  }
  return lineText.charAt(range.start.character - 1);
}

export function getParentText(document: vscode.TextDocument, textRange: vscode.Range): string {
  let range = textRange;
  let prevChar = getPrevChar(document, textRange);
  if (prevChar === '.') {
    // follow interface.modport
    range = document.getWordRangeAtPosition(range.start.translate(0, -1)) ?? range;
  } else if (prevChar === ':' && range.start.character > 1) {
    // follow package scope
    range = document.getWordRangeAtPosition(range.start.translate(0, -2)) ?? range;
  }
  return document.getText(range);
}


function filterPromise<T>(promise: Promise<Array<T>>): Promise<Array<T>> {
  return new Promise((resolve, reject) => {
      promise.then(value => {
          if (value.length > 0) {
              resolve(value); // Resolve only if value is valid
          }
          // If the value is not valid, do not resolve or reject,
          // effectively taking this promise out of the race.
      }).catch(reject); // Propagate rejection
  });
}

export function raceArrays<T>(promises: Array<Promise<Array<T>>>): Promise<Array<T>> {
  return Promise.race(promises.map(filterPromise));
}

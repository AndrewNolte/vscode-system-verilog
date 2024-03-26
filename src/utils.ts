import * as vscode from 'vscode';

export function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? undefined;
}

import * as vscode from 'vscode'

// enum class SlangKind {
//   InstanceKind,
//   ScopeKind,
//   ParamKind,
//   LogicKind,
//   WireKind,
// };

export enum SlangKind {
  Instance = 'Instance',
  Scope = 'Scope',
  Param = 'Param',
  Logic = 'Logic',
  Port = 'Port',
}

export function fromInt(kind: number): SlangKind {
  switch (kind) {
    case 0:
      return SlangKind.Instance
    case 1:
      return SlangKind.Port
    case 2:
      return SlangKind.Param
    case 3:
      return SlangKind.Logic
    case 4:
      return SlangKind.Scope
    default:
      return SlangKind.Instance
  }
}

/// Can't parse URIs
export interface Location {
  /**
   * The resource identifier of this location.
   */
  uri: string

  /**
   * The document range of this location.
   */
  range: vscode.Range
}

export interface Item {
  kind: SlangKind
  instName: string
  instLoc: Location
}

export interface Var extends Item {
  type: string
  value: string | undefined
}

// scopes are the only items that can have children
export interface Scope extends Item {
  children: Item[]
}

export interface Instance extends Item {
  declName: string
  declLoc: Location
}

// queried on an instance
export interface FilledInstance extends Scope, Instance {}

/// client -> server

/// Can be used by right clicking on a module or with button
/// Slang should automatically choose the module with no references
export async function setTopLevel(uri: string) {
  return await vscode.commands.executeCommand('slang.setTopLevel', uri)
}

/// May need to ask to select top level from the available modules
/// Or we can force the user to select the top level first, then specify the build file
export async function setBuildFile(uri: string) {
  return await vscode.commands.executeCommand('slang.setBuildFile', uri)
}

/// Get children at this path. Will return FilledInstance for the root
export async function getScope(hierPath: string): Promise<Item[]> {
  const children: Item[] = await vscode.commands.executeCommand('slang.getScope', hierPath)
  if (children === undefined) {
    vscode.window.showErrorMessage('Failed to get children for ' + hierPath)
    return []
  }
  return children
}

/// Query a list of scopes going down to this instance. FilledInstance ... Item
export async function getScopes(hierPath: string): Promise<Item[]> {
  return await vscode.commands.executeCommand('slang.getScopes', hierPath)
}

/// Module -> scopes for instances view
export async function getScopesByModule(): Promise<Map<string, string[]>> {
  return await vscode.commands.executeCommand('slang.getScopesByModule')
}

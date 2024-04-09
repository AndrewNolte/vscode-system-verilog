import { getVSCodeDownloadUrl } from "@vscode/test-electron/out/util";

import * as vscode from 'vscode';


export class Config {
    static getIncludePaths(): string[] {
        return vscode.workspace.getConfiguration().get('verilog.includes', []);
    }
}
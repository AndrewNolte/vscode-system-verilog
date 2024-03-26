// SPDX-License-Identifier: MIT
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

import * as ModuleInstantiation from './commands/ModuleInstantiation';
import { CtagsManager } from './ctags';
import { ExtensionManager } from './extensionManager';
import LintManager from './linter/LintManager';
import { createLogger, Logger } from './logger';
import * as CompletionItemProvider from './providers/CompletionItemProvider';
import * as DefinitionProvider from './providers/DefinitionProvider';
import * as DocumentSymbolProvider from './providers/DocumentSymbolProvider';
import * as FormatProvider from './providers/FormatPrivider';
import * as HoverProvider from './providers/HoverProvider';

export var logger: Logger; // Global logger
var ctagsManager: CtagsManager;
let extensionID: string = 'mshr-h.veriloghdl';

let lintManager: LintManager;
let languageClients = new Map<string, LanguageClient>();

export function activate(context: vscode.ExtensionContext) {
  logger = createLogger('Verilog');
  logger.info(extensionID + ' is now active.');

  ctagsManager = new CtagsManager(logger);

  let extMgr = new ExtensionManager(context, extensionID, logger.getChild('ExtensionManager'));
  if (extMgr.isVersionUpdated()) {
    extMgr.showChangelogNotification();
  }

  /////////////////////////////////////////////
  // Configure Providers
  /////////////////////////////////////////////

  let verilogDocumentSymbolProvider = new DocumentSymbolProvider.VerilogDocumentSymbolProvider(
    logger.getChild('VerilogDocumentSymbolProvider'),
    ctagsManager
  );

  let verilogCompletionItemProvider = new CompletionItemProvider.VerilogCompletionItemProvider(
    logger.getChild('VerilogCompletionItemProvider'),
    ctagsManager
  );

  let verilogHoverProvider = new HoverProvider.VerilogHoverProvider(
    logger.getChild('VerilogHoverProvider'),
    ctagsManager
  );

  let verilogDefinitionProvider = new DefinitionProvider.VerilogDefinitionProvider(
    logger.getChild('VerilogDefinitionProvider'),
    ctagsManager
  );

  // push provider subs to .v and .sv files
  const selectors = [
    { scheme: 'file', language: 'verilog' },
    { scheme: 'file', language: 'systemverilog' },
  ];
  selectors.forEach((selector) => {
    context.subscriptions.push(
      vscode.languages.registerDocumentSymbolProvider(selector, verilogDocumentSymbolProvider)
    );

    context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
        selector,
        verilogCompletionItemProvider,
        '.',
        '(',
        '='
      )
    );

    context.subscriptions.push(
      vscode.languages.registerHoverProvider(selector, verilogHoverProvider)
    );

    context.subscriptions.push(
      vscode.languages.registerDefinitionProvider(selector, verilogDefinitionProvider)
    );
  });

  /////////////////////////////////////////////
  // Configure Formatters
  /////////////////////////////////////////////

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { scheme: 'file', language: 'verilog' },
      new FormatProvider.VerilogFormatProvider(logger.getChild('VerilogFormatProvider'))
    )
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { scheme: 'file', language: 'systemverilog' },
      new FormatProvider.SystemVerilogFormatProvider(logger.getChild('SystemVerilogFormatProvider'))
    )
  );

  /////////////////////////////////////////////
  // Register Lint Manager, runs selected linters
  /////////////////////////////////////////////
  lintManager = new LintManager(logger.getChild('LintManager'));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(lintManager.lint));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(lintManager.lint));
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument(lintManager.removeFileDiagnostics)
  );
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(lintManager.configLinter));

  /////////////////////////////////////////////
  // Register Commands
  /////////////////////////////////////////////
  vscode.commands.registerCommand(
    'verilog.instantiateModule',
    ModuleInstantiation.instantiateModuleInteract
  );
  vscode.commands.registerCommand('verilog.lint', lintManager.runLintTool);

  /////////////////////////////////////////////
  // Language Servers
  /////////////////////////////////////////////
  vscode.workspace.onDidChangeConfiguration(async (event) => {
    if (!event.affectsConfiguration('verilog.languageServer')) {
      return;
    }
    await stopAllLanguageClients();
    initAllLanguageClients();
  });

  initAllLanguageClients();

  logger.info(extensionID + ' activation finished.');
}

function setupLanguageClient(
  name: string,
  defaultPath: string,
  serverArgs: string[],
  serverDebugArgs: string[],
  clientOptions: LanguageClientOptions
) {
  let settings = vscode.workspace.getConfiguration('verilog.languageServer.' + name);
  let enabled: boolean = <boolean>settings.get('enabled', false);

  let binPath = <string>settings.get('path', defaultPath);

  let serverOptions: ServerOptions = {
    run: { command: binPath, args: serverArgs },
    debug: { command: binPath, args: serverDebugArgs },
  };

  let lc = new LanguageClient(name, name + ' language server', serverOptions, clientOptions);
  languageClients.set(name, lc);
  if (!enabled) {
    return;
  }
  lc.start();
  logger.info('"' + name + '" language server started.');
}

function initAllLanguageClients() {
  // init svls
  setupLanguageClient('svls', 'svls', [], ['--debug'], {
    documentSelector: [{ scheme: 'file', language: 'systemverilog' }],
  });

  // init veridian
  setupLanguageClient('veridian', 'veridian', [], [], {
    documentSelector: [{ scheme: 'file', language: 'systemverilog' }],
  });

  // init hdlChecker
  setupLanguageClient('hdlChecker', 'hdl_checker', ['--lsp'], ['--lsp'], {
    documentSelector: [
      { scheme: 'file', language: 'verilog' },
      { scheme: 'file', language: 'systemverilog' },
      { scheme: 'file', language: 'vhdl' },
    ],
  });

  // init verible-verilog-ls
  setupLanguageClient('veribleVerilogLs', 'verible-verilog-ls', [], [], {
    documentSelector: [{ scheme: 'file', language: 'systemverilog' }],
  });

  // init rustHdl
  setupLanguageClient('rustHdl', 'vhdl_ls', [], [], {
    documentSelector: [{ scheme: 'file', language: 'vhdl' }],
  });
}

function stopAllLanguageClients(): Promise<any> {
  var p = [];
  for (const [name, client] of languageClients) {
    if (client.isRunning()) {
      p.push(client.stop());
      logger.info('"' + name + '" language server stopped.');
    }
  }
  return Promise.all(p);
}

export function deactivate(): Promise<void> {
  logger.info('Deactivated');
  return stopAllLanguageClients();
}

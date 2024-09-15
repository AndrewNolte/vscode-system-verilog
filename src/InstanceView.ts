import * as vscode from 'vscode'
import { ViewComponent } from './lib/libconfig'

type SidebarState = {
  instance: string
}

export class InstanceView extends ViewComponent implements vscode.WebviewViewProvider {
  constructor() {
    super({
      name: 'Instance',
      //   welcome: {
      //     contents: '[Select top level](command:verilog.project.selectTopLevel)',
      //   },
      type: 'webview',
      icon: '$(chip)',
      //   initialSize: 50,
    })
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(this.configPath!, this))
  }
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<SidebarState>,
    _token: vscode.CancellationToken
  ): Thenable<void> | void {
    webviewView.webview.options = {
      enableScripts: true,
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'alert':
          vscode.window.showInformationMessage(
            `Input: ${message.text}, Selected: ${message.selected}`
          )
          return
      }
    })
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sidebar Input</title>
        <style>
          body { padding: 10px; }
          input, select { width: 100%; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <input type="text" id="messageInput" placeholder="Enter a message">
        <select id="instanceSelect">
          <option value="instance1">Instance 1</option>
          <option value="instance2">Instance 2</option>
          <option value="instance3">Instance 3</option>
        </select>
        <button id="sendButton">Send</button>

        <script>
          const vscode = acquireVsCodeApi();
          const messageInput = document.getElementById('messageInput');
          const instanceSelect = document.getElementById('instanceSelect');
          const sendButton = document.getElementById('sendButton');

          sendButton.addEventListener('click', () => {
            const message = messageInput.value;
            const selected = instanceSelect.value;
            vscode.postMessage({
              command: 'alert',
              text: message,
              selected: selected
            });
          });
        </script>
      </body>
      </html>
    `
  }
}

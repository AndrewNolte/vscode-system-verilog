import * as vscode from 'vscode'
import { ext } from '../extension'
import { ViewComponent } from '../lib/libconfig'

type SidebarState = {
  instance: string
}

export class InstanceView extends ViewComponent implements vscode.WebviewViewProvider {
  view: vscode.WebviewView | undefined
  htmlStr: string
  constructor() {
    super({
      name: 'Instance',
      type: 'webview',
      icon: '$(chip)',
    })
    this.htmlStr = ''
  }

  async activate(context: vscode.ExtensionContext): Promise<void> {
    const indexPath = vscode.Uri.joinPath(
      ext.context.extensionUri,
      'src',
      'sidebar',
      'instances.html'
    )
    const contents = await vscode.workspace.fs.readFile(indexPath)
    this.htmlStr = new TextDecoder().decode(contents)

    context.subscriptions.push(vscode.window.registerWebviewViewProvider(this.configPath!, this))
  }
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<SidebarState>,
    _token: vscode.CancellationToken
  ): Thenable<void> | void {
    this.view = webviewView
    webviewView.webview.options = {
      enableScripts: true,
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview)
    webviewView.webview.onDidReceiveMessage((message) => {
      console.log('message', message)
      switch (message.command) {
        case 'setInstance':
          vscode.window.showInformationMessage(`Select Instance: ${message.instance}`)
          ext.project.setInstance.func(message.instance)
          return
      }
    })
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    return this.htmlStr
  }
}

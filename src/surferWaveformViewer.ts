import * as vscode from 'vscode'
import { ExtensionComponent } from './lib/libconfig'

class Wavefile implements vscode.CustomDocument {
  uri: vscode.Uri
  constructor(uri: vscode.Uri) {
    this.uri = uri
  }
  dispose(): void {}
}

export class SurferComponent
  extends ExtensionComponent
  implements vscode.CustomReadonlyEditorProvider<Wavefile>
{
  extensionUri: vscode.Uri | undefined
  public async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
      vscode.window.registerCustomEditorProvider('surfer.waveformViewer', this, {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      })
    )
    this.extensionUri = context.extensionUri
  }

  getExtensionUri(): vscode.Uri {
    return this.extensionUri!
  }

  async openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken
  ): Promise<Wavefile> {
    return new Wavefile(uri)
  }
  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // Add the folder that the document lives in as a localResourceRoot
    const uriString = document.uri.toString()
    // TODO: this probably doesn't play well with windows
    const dirPath = uriString.substring(0, uriString.lastIndexOf('/'))

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri!, 'surfer'),
        vscode.Uri.parse(dirPath, true),
      ],
    }

    webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview, document.uri)
  }

  // Get the static html used for the editor webviews.
  private async getHtmlForWebview(webview: vscode.Webview, uri: vscode.Uri): Promise<string> {
    // Read index.html from disk
    const indexPath = vscode.Uri.joinPath(this.getExtensionUri(), 'surfer', 'index.html')
    const contents = await vscode.workspace.fs.readFile(indexPath)

    // Get WebView URIs
    const manifestJSONUriString = webview
      .asWebviewUri(vscode.Uri.joinPath(this.getExtensionUri(), 'surfer', 'manifest.json'))
      .toString()

    const surferBGWASMUriString = webview
      .asWebviewUri(vscode.Uri.joinPath(this.getExtensionUri(), 'surfer', 'surfer_bg.wasm'))
      .toString()

    const surferJSUriString = webview
      .asWebviewUri(vscode.Uri.joinPath(this.getExtensionUri(), 'surfer', 'surfer.js'))
      .toString()

    const swJSUriString = webview
      .asWebviewUri(vscode.Uri.joinPath(this.getExtensionUri(), 'surfer', 'sw.js'))
      .toString()

    // Replace local paths with paths derived from WebView URIs
    let html = new TextDecoder().decode(contents)
    html = this.replaceAll(html, './manifest.json', manifestJSONUriString)
    html = this.replaceAll(html, './surfer_bg.wasm', surferBGWASMUriString)
    html = this.replaceAll(html, './surfer.js', surferJSUriString)
    html = this.replaceAll(html, './sw.js', swJSUriString)

    // Get the URI of the document that the user has selected, set window.query_string to it
    const documentUri = webview.asWebviewUri(uri).toString()
    const query_string = `?load_url=${documentUri}&amp;startup_commands=toggle_menu`
    html = this.replaceAll(
      html,
      'window.query_string = null;',
      `window.query_string = "${query_string}"`
    )

    return html
  }

  private replaceAll(input: string, search: string, replacement: string): string {
    return input.replace(new RegExp(search, 'g'), replacement)
  }
}

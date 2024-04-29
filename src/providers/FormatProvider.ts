// SPDX-License-Identifier: MIT

import * as child_process from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { getWorkspaceFolder } from '../utils'
import { ToolConfig } from '../lib/runner'
import { ExtensionComponent, ConfigObject } from '../lib/libconfig'
// handle temporary file
class TemporaryFile {
  public readonly path: string

  constructor(prefix: string, ext: string) {
    this.path = path.join(
      os.tmpdir(),
      prefix + '-' + crypto.randomBytes(16).toString('hex') + '.tmp' + ext
    )
  }

  public writeFileSync(data: string, options?: fs.WriteFileOptions) {
    fs.writeFileSync(this.path, data, options)
  }

  public readFileSync(
    options: BufferEncoding | { encoding: BufferEncoding; flag?: string }
  ): string {
    return fs.readFileSync(this.path, options)
  }

  public dispose(): void {
    if (fs.existsSync(this.path)) {
      fs.rmSync(this.path)
    }
  }
}
abstract class FileBasedFormattingEditProvider
  extends ToolConfig
  implements vscode.DocumentFormattingEditProvider
{
  private namespace: string
  private tmpFileExt: string // .v, .sv, .vhd

  constructor(namespace: string, tmpFileExt: string) {
    super(namespace)
    this.namespace = namespace
    this.tmpFileExt = tmpFileExt
  }

  // should be implemented to match formatter's argument
  protected abstract prepareArgument(tmpFilepath: string): string[]

  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    // create temporary file and copy document to it
    let tempFile: TemporaryFile = new TemporaryFile(this.namespace, this.tmpFileExt)
    tempFile.writeFileSync(document.getText(), { flag: 'w' })
    this.logger.info('Temp file created at:' + tempFile.path)

    let args = this.args.getValue().split(' ')
    args = args.concat(this.prepareArgument(tempFile.path))

    // execute command
    let binPath: string = this.path.getValue()
    if (binPath === undefined) {
      this.logger.warn('No path specified for formatter')
      return []
    }
    this.logger.info('Executing command: ' + binPath + ' ' + args.join(' '))
    try {
      child_process.execFileSync(binPath, args, {
        cwd: getWorkspaceFolder(),
      })
      let formattedText: string = tempFile.readFileSync({ encoding: 'utf-8' })
      let wholeFileRange: vscode.Range = new vscode.Range(
        document.positionAt(0),
        document.lineAt(document.lineCount - 1).range.end
      )
      tempFile.dispose()
      return [vscode.TextEdit.replace(wholeFileRange, formattedText)]
    } catch (err) {
      this.logger.error((err as Error).toString())
    }

    tempFile.dispose()
    return []
  }
}
class VerilogFormatEditProvider extends FileBasedFormattingEditProvider {
  prepareArgument(tmpFilepath: string): string[] {
    return ['-f', tmpFilepath]
  }
}

class IStyleVerilogFormatterEditProvider extends FileBasedFormattingEditProvider {
  prepareArgument(tmpFilepath: string): string[] {
    // -n means not to create a .orig file
    return ['-n', tmpFilepath]
  }
}

class VeribleVerilogFormatEditProvider extends FileBasedFormattingEditProvider {
  prepareArgument(tmpFilepath: string): string[] {
    return ['--inplace', tmpFilepath]
  }
}

/////////////////////////////////////////////
// Verilog Formatter
/////////////////////////////////////////////

enum VerilogFormatter {
  VerilogFormat = 'verilog-format',
  IstyleFormat = 'istyle-format',
  Verible = 'verible-verilog-format',
}
export class VerilogFormatProvider
  extends ExtensionComponent
  implements vscode.DocumentFormattingEditProvider
{
  verilogFormatter: VerilogFormatEditProvider = new VerilogFormatEditProvider('verilogFormat', '.v')
  iStyleFormatter: IStyleVerilogFormatterEditProvider = new IStyleVerilogFormatterEditProvider(
    'istyleFormat',
    '.v'
  )
  veribleFormatter: VeribleVerilogFormatEditProvider = new VeribleVerilogFormatEditProvider(
    'verible',
    '.v'
  )

  formatter: ConfigObject<VerilogFormatter> = new ConfigObject({
    description: 'Formatter Selection',
    default: VerilogFormatter.Verible,
    type: 'string',
    enum: [VerilogFormatter.VerilogFormat, VerilogFormatter.IstyleFormat, VerilogFormatter.Verible],
  })

  async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'verilog' },
        this
      )
    )
  }

  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    let fmt = this.formatter.getValue()
    if (fmt === null) {
      this.logger.warn('null formatter')
      return
    }

    switch (fmt) {
      case VerilogFormatter.VerilogFormat:
        return this.verilogFormatter.provideDocumentFormattingEdits(document, _options, _token)
      case VerilogFormatter.IstyleFormat:
        return this.iStyleFormatter.provideDocumentFormattingEdits(document, _options, _token)
      case VerilogFormatter.Verible:
        return this.veribleFormatter.provideDocumentFormattingEdits(document, _options, _token)
    }
  }
}

/////////////////////////////////////////////
// Sv Formatter
/////////////////////////////////////////////

enum SvFormatter {
  VeribleVerilogFormat = 'verible-verilog-format',
}
export class SystemVerilogFormatProvider
  extends ExtensionComponent
  implements vscode.DocumentFormattingEditProvider
{
  verible: VeribleVerilogFormatEditProvider = new VeribleVerilogFormatEditProvider(
    'verible-verilog-format',
    '.sv'
  )

  formatter: ConfigObject<SvFormatter> = new ConfigObject({
    description: 'Formatter Selection',
    default: SvFormatter.VeribleVerilogFormat,
    type: 'string',
    enum: [SvFormatter.VeribleVerilogFormat],
  })

  async activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
      vscode.languages.registerDocumentFormattingEditProvider(
        { scheme: 'file', language: 'systemverilog' },
        this
      )
    )
  }

  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    _options: vscode.FormattingOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TextEdit[]> {
    let fmt = this.formatter.getValue()
    this.logger.info(`formatting ${document.uri.fsPath}`)
    if (fmt !== 'verible-verilog-format') {
      this.logger.warn(`Unknown formatter: ${fmt}`)
      return
    }
    return this.verible.provideDocumentFormattingEdits(document, _options, _token)
  }
}

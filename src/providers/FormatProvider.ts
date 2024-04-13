// SPDX-License-Identifier: MIT

import * as child from 'child_process'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { getWorkspaceFolder } from '../utils'
import { ToolConfig } from '../runner'
import { ExtensionComponent, ConfigObject } from '../libconfig'
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

// Base class
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
      child.execFileSync(binPath, args, {
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

enum VerilogFormatter {
  verilogFormat = 'verilog-format',
  istyleFormat = 'istyle-format',
  verible = 'verible-verilog-format',
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
    default: VerilogFormatter.verible,
    type: 'string',
    enum: [VerilogFormatter.verilogFormat, VerilogFormatter.istyleFormat, VerilogFormatter.verible],
  })

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
      case VerilogFormatter.verilogFormat:
        return this.verilogFormatter.provideDocumentFormattingEdits(document, _options, _token)
      case VerilogFormatter.istyleFormat:
        return this.iStyleFormatter.provideDocumentFormattingEdits(document, _options, _token)
      case VerilogFormatter.verible:
        return this.veribleFormatter.provideDocumentFormattingEdits(document, _options, _token)
    }
  }
}

class VeribleVerilogFormatEditProvider extends FileBasedFormattingEditProvider {
  prepareArgument(tmpFilepath: string): string[] {
    return ['--inplace', tmpFilepath]
  }
}

enum SvFormatter {
  veribleVerilogFormat = 'verible-verilog-format',
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
    default: SvFormatter.veribleVerilogFormat,
    type: 'string',
    enum: [SvFormatter.veribleVerilogFormat],
  })

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

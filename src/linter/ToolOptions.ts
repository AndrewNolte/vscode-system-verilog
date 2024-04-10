import * as vscode from 'vscode'
import { Config } from '../config'

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum svStandard {
  sv2005 = 'SystemVerilog-2005',
  sv2009 = 'SystemVerilog-2009',
  sv2012 = 'SystemVerilog-2012',
  //   sv2017 = 'SystemVerilog2017',
  //   sv2023 = 'SystemVerilog2023',
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum verilogStandard {
  v1995 = 'Verilog-95',
  v2001 = 'Verilog-2001',
  v2005 = 'Verilog-2005',
}

export class GeneralOptions {
  /// common options for tools
  includes!: string[]
  verilogStandard!: verilogStandard
  svStandard!: svStandard
  runAtFileLocation!: boolean

  constructor() {
    this.includes = Config.getIncludePaths()
    this.verilogStandard = vscode.workspace
      .getConfiguration()
      .get('verilog.verilogStandard', verilogStandard.v2005)
    this.svStandard = vscode.workspace
      .getConfiguration()
      .get('verilog.svStandard', svStandard.sv2012)
    this.runAtFileLocation = vscode.workspace
      .getConfiguration()
      .get('verilog.runAtFileLocation', false)
  }
}

export class LinterOptions {
  name: string
  path: string
  constructor(name: string) {
    this.name = name
    this.path = name
  }

  // for each lint tool
  enabled: boolean = false
  args: string = ''
  useWsl: boolean = false

  // can append to common includes with ${includes}
  includes: string[] = []
}

export class FileDiagnostic extends vscode.Diagnostic {
  file: string
  constructor(
    file: string,
    range: vscode.Range,
    message: string,
    severity?: vscode.DiagnosticSeverity
  ) {
    super(range, message, severity)
    this.file = file
  }
}

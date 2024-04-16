// SPDX-License-Identifier: MIT
import * as assert from 'assert'

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode'
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.')

  test('Sample test', async () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5))
    assert.strictEqual(-1, [1, 2, 3].indexOf(0))

    // let ext = new VerilogExtension()
    // ext.compile('verilog')
    // let j = ext.getConfigJson()
    // console.log(JSON.stringify(j, null, 2))
    let exts: string[] = vscode.extensions.all.map((e) => e.id)
    console.log(exts)
    // await vscode.commands.executeCommand('verilog.dev.dumpConfig')
  })
})

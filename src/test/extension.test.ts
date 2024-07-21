// SPDX-License-Identifier: MIT
import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import Diff from 'deep-diff'

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.')

  test('Sample test', async () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5))
    assert.strictEqual(-1, [1, 2, 3].indexOf(0))
  })
})

suite('Hover Provider Test Suite', async () => {
  const cwd = __dirname.replace('/out/', '/')
  const workspaceUri = vscode.Uri.file(path.resolve(cwd, 'workspace'))
  vscode.workspace.updateWorkspaceFolders(0, 0, { uri: workspaceUri })
  const files = fs.readdirSync(workspaceUri.fsPath)
  console.log('Checking files:', files)

  for (const file of files) {
    if (!file.endsWith('.sv')) {
      continue
    }

    test(`Hover defs for ${file}`, async () => {
      // Open the workspace
      console.log(`Hover defs for ${file}`)
      const sampleFileUri = vscode.Uri.file(path.resolve(workspaceUri.fsPath, file))
      const document = await vscode.workspace.openTextDocument(sampleFileUri)
      // execute verilog.reindex to ensure the extension is activated
      await vscode.commands.executeCommand('verilog.reindex')
      const _editor = await vscode.window.showTextDocument(document)

      // record all hovers. Because of the way the extension is designed, this is equivalent to verifying definitions
      const results: { [position: string]: string } = {}
      for (let line = 0; line < document.lineCount; line++) {
        const textLine = document.lineAt(line)
        for (let character = 0; character < textLine.text.length; character++) {
          const position = new vscode.Position(line, character)
          const hover = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider',
            document.uri,
            position
          )

          if (hover) {
            console.log(hover)
            results[`${line}:${character}`] = hover
              .map((h) =>
                h.contents.map((c) => (c instanceof vscode.MarkdownString ? c.value : c)).join(' ')
              )
              .join(' ')
          }
        }
      }

      const goldenFilePath = path.resolve(cwd, 'golden', `${file}.json`)

      // compare to golden, if it exists
      if (!fs.existsSync(goldenFilePath) || process.env.UPDATE_GOLDEN) {
        console.log('No golden file found, creating it now')
        fs.mkdirSync(path.dirname(goldenFilePath), { recursive: true })
        fs.writeFileSync(goldenFilePath, JSON.stringify(results, null, 2))
      }
      // diff with golden, print diff
      const expectedResults = JSON.parse(fs.readFileSync(goldenFilePath, 'utf8'))
      const differences = Diff.diff(results, expectedResults)

      console.log(JSON.stringify(differences, null, 2))

      if (differences !== undefined) {
        assert.fail('Hover results do not match the golden file')
      }
    })
  }
})

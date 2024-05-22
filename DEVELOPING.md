# Developing

Install nvm (Node Version Manager), or install Node 20

```
git clone git@github.com:AndrewNolte/vscode-system-verilog.git
cd vscode-system-verilog
nvm use 20
npm install
code .
```
Go to `Run and Debug` in vscode, and click `Launch Extension`

### Debugging

- The logger logs to the `verilog` output channel on the new vscode window, and is also available in production
- `console.log()` logs to the debug console of the vscode-system-verilog/ vscode window.
- `vscode.window.showInformationMessage()` is useful for showing popups to debug
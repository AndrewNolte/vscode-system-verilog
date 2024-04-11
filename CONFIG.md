
## Configuration Settings

This may be out of date, I'm changing quite a bit right now.

- `verilog.lint.iverilog.args` (Default: nothing)

    Add custom arguments to Icarus Verilog for linting, like `-Wall` . The argument `-t null` will be added by the linter automatically.

- `verilog.lint.iverilog.includes` (Default: nothing)

    A list of directory paths to use while Icarus Verilog linting.
    All the paths are passed as arguments `-I <directory_path>`.
    Paths can be specified either an absolute or a relate to the workspace directory.

- `verilog.lint.iverilog.runAtFileLocation` (Default: `false` )

    By default, the linter will be run at the workspace directory. Enable this option to run at the file location. If enabled, `` ` include`` directives should contain file paths relative to the current file.

- `verilog.lint.modelsim.args` (Default: nothing)

    Add custom arguments to Modelsim for linting.

- `verilog.lint.modelsim.work` (Default: nothing)

    Add custom work library to Modelsim for linting.

- `verilog.lint.slang.args` (Default: nothing)

    Add Slang arguments here (like macros). They will be added to Slang while linting (The command \"-I=<document folder>\" will be added by the linter by default).

- `verilog.lint.slang.includes` (Default: nothing)

    A list of directory paths to use while Slang linting.

- `verilog.lint.slang.runAtFileLocation` (Default: `false` )

    If enabled, Slang will be run at the file location for linting. Else it will be run at workspace folder. Disabled by default.

- `verilog.lint.slang.useWSL` (Default: `false` )

    Run verilator under WSL. Paths generated automatically by the extension (the path to the Verilog file as well as
    the auto-generated document folder for `-I` ) are translated to WSL paths using the `wslpath` program.
    Any other paths you specify in `verilog.lint.includes.args`

- `verilog.lint.verilator.args` (Default: nothing)

    Add custom arguments to Verilator for linting, like `-Wall` . The argument `--lint-only -I<document folder>` will be added by the linter automatically.

- `verilog.lint.verilator.includes` (Default: nothing)

    A list of directory paths to use while Verilator linting.
    All the paths are passed as arguments `-I<directory_path>`.
    Paths can be specified either an absolute or a relate to the workspace directory.

- `verilog.lint.verilator.runAtFileLocation` (Default: `false` )

    By default, the linter will be run at the workspace directory. Enable this option to run at the file location. If enabled, `` ` include`` directives should contain file paths relative to the current file.

- `verilog.lint.verilator.useWSL` (Default: `false` )

    Run verilator under WSL (use `apg-get install verilator` to install). Paths generated automatically by the
    extension (the path to the Verilog file as well as the auto-generated document folder for `-I` ) are translated
    to WSL paths using the `wslpath` program. Any other paths you specify in `verilog.lint.verilator.args`

    must be manually converted.

- `verilog.lint.xvlog.args` (Default: nothing)

    Add custom arguments to Xilinx xvlog for linting, like `-Wall` . The argument `--nolog` will be added by the linter automatically.

- `verilog.lint.xvlog.includes` (Default: nothing)

    A list of directory paths to use while Xilinx xvlog linting.
    All the paths are passed as arguments `-i <directory_path>`.
    Paths can be specified either an absolute or a relate to the workspace directory.

- `verilog.ctags.path` (Default: `ctags` )

    Path to your installation of Ctags if it isn't already present in your `PATH` environment variable.

- `verilog.languageServer.svls.enabled` (Default: `false`)

     Enable svls Language Server for SystemVerilog.

- `verilog.languageServer.svls.path` (Default: `svls`)

     A path to the svls Language Server binary.

- `verilog.languageServer.veridian.enabled` (Default: `false`)

     Enable veridian Language Server for SystemVerilog.

- `verilog.languageServer.veridian.path` (Default: `veridian`)

     A path to the veridian Language Server binary.

- `verilog.languageServer.hdlChecker.enabled` (Default: `false`)

     Enable HDL Checker Language Server for Verilog-HDL, SystemVerilog, and VHDL.

- `verilog.languageServer.hdlChecker.path` (Default: `hdl_checker`)

     A path to the HDL Checker Language Server binary.

- `verilog.languageServer.veribleVerilogLs.enabled` (Default: `false`)

     Enable verible-verilog-ls Language Server for SystemVerilog.

- `verilog.languageServer.veribleVerilogLs.path` (Default: `verible-verilog-ls`)

     A path to the verible-verilog-ls Language Server binary.

- `verilog.languageServer.rustHdl.enabled` (Default: `false`)

     Enable rust_hdl Language Server for VHDL.

- `verilog.languageServer.rustHdl.path` (Default: `vhdl_ls`)

     A path to the rust_hdl Language Server binary.

- `verilog.format.verilogHDL.formatter` (Default: `verilog-format`)

     Choose the Verilog-HDL formatter. Possible values are:

  - `verilog-format`
  - `iStyle`
  - `verible-verilog-format`

- `verilog.format.systemVerilog.formatter` (Default: `verible-verilog-format`)

     Choose the Verilog-HDL formatter. Possible values are:

  - `verible-verilog-format`

- `verilog.format.verilogFormat.path` (Default: `verilog-format`)

     A path to the verilog-format binary.

- `verilog.format.verilogFormat.settings` (Default: `${env:HOME}/.verilog-format.properties`)

     A path to the verilog-format settings file.

- `verilog.format.istyleFormatter.path` (Default: `iStyle`)

     A path to the iStyle Verilog Formatter binary.

- `verilog.format.istyleFormatter.args` (Default: nothing)

     Add custom arguments to iStyle Verilog Formatter for formatting.

- `verilog.format.istyleFormatter.style` (Default: `Indent only`)

     Choose styling options from ANSI/K&R/GNU.

- `verilog.format.veribleFormatter.path` (Default: `verible-verilog-format`)

     A path to the verible-verilog-format binary.

- `verilog.format.veribleFormatter.args` (Default: nothing)

     Add custom arguments to verible-verilog-format for formatting.

## Compatibility

| Feature                           |  Windows   |    Linux     |    macOS    |
| --------------------------------- | :--------: | :----------: | :---------: |
| Basics (like Syntax highlighting) | Windows 10 | Ubuntu 20.04 | macOS 10.15 |
| Icarus Verilog                    | Windows 10 | Ubuntu 18.04 |     Yes     |
| Vivado Logical Simulation         | Windows 10 |  Not Tested  | Not Tested  |
| Modelsim                          | Windows 10 | Ubuntu 18.04 | Not Tested  |
| Verilator                         | Windows 10 |   Debian 9   | Not Tested  |
| Ctags Integration                 | Windows 10 | Ubuntu 18.10 | Not Tested  |
| Language Server                   | Windows 10 | Ubuntu 20.04 | macOS 10.15 |
| Formatting                        | Not tested | Ubuntu 20.04 | Not tested  |

If you have tested the linters in new platforms or have issues with them, feel free to file an issue.

## [Guidelines for Contributing](./CONTRIBUTING.md)

## Logs

Logs are outputted to LogOutputChannel in th VS Code.
You can check it by opening the **Output** pane in VS Code and choose _Verilog_ in the drop-down menu.

## Helpful links

- [Verilog in VSCode With Linting (Using Modelsim) - YouTube](https://www.youtube.com/watch?v=-DTGf3Z6v_o)

## Thanks

- To all our [Contributors](https://github.com/mshr-h/vscode-verilog-hdl-support/graphs/contributors)
- [Textmate Package for Verilog](https://github.com/textmate/verilog.tmbundle)
- [SublimeLinter-contrib-iverilog](https://github.com/jfcherng/SublimeLinter-contrib-iverilog)
- [SublimeLinter-contrib-vlog](https://github.com/dave2pi/SublimeLinter-contrib-vlog)
- [yangsu/sublime-vhdl](https://github.com/yangsu/sublime-vhdl)
- [Sublime EDA](https://github.com/tschinz/sublime_eda)
- [dalance/svls](https://github.com/dalance/svls)
- [vivekmalneedi/veridian](https://github.com/vivekmalneedi/veridian)
- [suoto/hdl_checkerChecker](https://github.com/suoto/hdl_checker)
- [chipsalliance/verible](https://github.com/chipsalliance/verible)
- [ericsonj/verilog-format](https://github.com/ericsonj/verilog-format)
- [thomasrussellmurphy/istyle-verilog-formatter](https://github.com/thomasrussellmurphy/istyle-verilog-formatter)
- [slang C++ docs](https://sv-lang.com/)
- [bitwisecook/vscode-tcl: Tcl for Visual Studio Code](https://github.com/bitwisecook/vscode-tcl)
  - `configs/tcl.configuration.json` and `syntaxes/tcl.tmlanguage.json` are obtained from the repo.

# vscode-system-verilog

SystemVerilog support for VS Code with Syntax Highlighting, Snippets, Linting, Formatting, and hover/definitions

[![Install Count](https://img.shields.io/visual-studio-marketplace/i/AndrewNolte.vscode-system-verilog)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog)
[![Download Count](https://img.shields.io/visual-studio-marketplace/d/AndrewNolte.vscode-system-verilog.png)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog)

![sample](images/sample.gif)

## Installation

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items/AndrewNolte.vscode-system-verilog)

## Features

- Syntax Highlighting
  - Verilog-HDL
  - SystemVerilog
  - VHDL
  - Vivado UCF constraints
  - Synopsys Design Constraints
  - Verilog Filelists (dot-F files)
  - Tcl
- Simple Snippets
- Linting support from: \
  [![](https://img.shields.io/github/stars/MikePopoloski/slang?label=Slang&style=social) ![](https://img.shields.io/github/commit-activity/t/MikePopoloski/slang?label=commits&style=social)](https://github.com/MikePopoloski/slang)  - `slang` \
  [![](https://img.shields.io/github/stars/verilator/verilator?label=Verilator&style=social) ![](https://img.shields.io/github/commit-activity/t/verilator/verilator?label=commits&style=social)](https://github.com/verilator/verilator) - `verilator` \
  [![](https://img.shields.io/github/stars/steveicarus/iverilog?label=Icarus&style=social) ![](https://img.shields.io/github/commit-activity/t/steveicarus/iverilog?label=commits&style=social)](https://github.com/steveicarus/iverilog) - `iverilog` \
  [Modelsim](https://eda.sw.siemens.com/en-US/ic/modelsim/) - `modelsim` \
  [Vivado Logical Simulation](https://www.xilinx.com/products/design-tools/vivado.html) - `xvlog` 
- Code analysis
  - Document symbols outline
  - Hover and definitions across files
- Code completion
  - Automatic module instantiation when typing
  - Suggests symbols in the current module
- Formatting support from: \
  [![](https://img.shields.io/github/stars/chipsalliance/verible?label=verible-verilog-format&style=social)](https://github.com/chipsalliance/verible/tree/master/verilog/tools/formatter) \
  [![](https://img.shields.io/github/stars/ericsonj/verilog-format?label=verilog-format&style=social)](https://github.com/ericsonj/verilog-format) (verilog only)\
  [![](https://img.shields.io/github/stars/thomasrussellmurphy/istyle-verilog-formatter?label=istyle-verilog-formatter&style=social)](https://github.com/thomasrussellmurphy/istyle-verilog-formatter) (verilog only) 
- Language Server support (experimental) from: \
[![](https://img.shields.io/github/stars/chipsalliance/verible?label=verible-verilog-ls&style=social) ![](https://img.shields.io/github/commit-activity/t/chipsalliance/verible?label=commits&style=social)](https://github.com/chipsalliance/verible/tree/master/verilog/tools/ls) \
[![](https://img.shields.io/github/stars/VHDL-LS/rust_hdl?label=RustHdl&style=social) ![](https://img.shields.io/github/commit-activity/t/VHDL-LS/rust_hdl?label=commits&style=social)](https://github.com/VHDL-LS/rust_hdl) (VHDL only)\
[![](https://img.shields.io/github/stars/dalance/svls?label=svls&style=social) ![](https://img.shields.io/github/commit-activity/t/dalance/svls?label=commits&style=social)](https://github.com/dalance/svls) \
[![](https://img.shields.io/github/stars/suoto/hdl_checker?label=hdlChecker&style=social) ![](https://img.shields.io/github/commit-activity/t/suoto/hdl_checker?label=commits&style=social)](https://github.com/suoto/hdl_checker) \
[![](https://img.shields.io/github/stars/vivekmalneedi/veridian?label=veridian&style=social) ![](https://img.shields.io/github/commit-activity/t/vivekmalneedi/veridian?label=commits&style=social)](https://github.com/vivekmalneedi/veridian)


## Recommended Configuration

### Install [universal-ctags](https://github.com/universal-ctags/ctags)

This is used for definition support, hover support, and most of the analysis features.

Use 6.1 or later for port/param definition support

- Windows - Release are [here](https://github.com/universal-ctags/ctags-win32/releases)
- Linux - Releases are [here](https://github.com/universal-ctags/ctags/releases/)
- macOS - Install through Homebrew: ```brew install universal-ctags```

### Install [slang](https://github.com/MikePopoloski/slang)




This is recommended because it's the [fastest and most compliant](https://github.com/MikePopoloski/slang?tab=readme-ov-file#:~:text=slang%20is%20the%20fastest%20and%20most%20compliant%20SystemVerilog%20frontend%20(according%20to%20the%20open%20source%20chipsalliance%20test%20suite).) language frontend, and it has very precise error messages.

### Example Configuration

```json
// these get passed to linters and other tools
"verilog.includes": [
    "hdl/lib",
    "hdl/includes"
],
"verilog.ctags.path": "/usr/local/bin/ctags-universal",
"verilog.lint.slang.enabled": true,
// includes and '-y .sv_cache/files' are already passed to linters
"verilog.lint.slang.args": "--error-limit 200",
"verilog.lint.slang.path": "/usr/local/bin/slang",
"verilog.lint.verilator.enabled": true,
// tools will use the default name on the path if not given
"verilog.format.svFormatter": "verible-verilog-format",
"verilog.format.verible.args": "--flagfile=myflags.txt",
"verilog.format.verible.path": "/usr/local/bin/verible-verilog-format",
"verilog.format.dirs": [
    "hdl/myproject"
],
```

Explore all configuration options [here](CONFIG.md)

For debugging your config, you can see the logs in Output tab > select 'verilog' in the dropdown


## Why this extension?

This was forked from https://github.com/mshr-h/vscode-verilog-hdl-support because I wanted to move faster with shipping features and refine the focus on system verilog and large monorepos.

Since forking, these features have been added:
- Indexing
  - in memory index for ModuleName.sv -> path/to/ModuleName.sv
  - symlink file index in .sv_cache/files
  - indexes .svh files to pick up macros
  - works on the assumption that ModuleName.sv contains ModuleName
- Definition Provider
  - port/params definitions
  - Interface.var definitions
  - InterfaceArray[x].var definitions
  - greatly improved hover/definition performance
- Linters
  - ability to run multiple linters
  - fixed verilator lint
  - Passes -y .sv_cache/files for tools 
  - more precise slang and verilator lint ranges
- autocomplete module/interface while typing - 'Module #(' will trigger completion
- format on save for directories specified in config
- simplified configuration

There's a lot more planned as well:
- expanded hover support for hierarchical references (ctags needs a fix)
- slang language server
- expand macros on hover + expansion command
- builtin functions with description on hover
- project or top level selection
  - instance selection within project
  - context aware inlay hints for elaboration


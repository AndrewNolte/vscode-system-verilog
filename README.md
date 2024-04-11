# vscode-system-verilog

SystemVerilog support for VS Code with Syntax Highlighting, Snippets, Linting, Formatting, and hover/definitions

[![Install Count](https://img.shields.io/visual-studio-marketplace/i/AndrewNolte.vscode-system-verilog)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog)
[![Download Count](https://img.shields.io/visual-studio-marketplace/d/AndrewNolte.vscode-system-verilog.png)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog)

![sample](images/sample.gif)

## Installation

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items/mshr-h.VerilogHDL)

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
- Linting support from:
  - Slang - `slang`
  - Verilator - `verilator`
  - Icarus Verilog - `iverilog`
  - Modelsim - `modelsim`
  - Vivado Logical Simulation - `xvlog`
- Lightweight Definition Provider (ctags)
  - Autocomplete
  - Document Symbols Outline
  - Hover over variable declaration, including nested hovers
  - Go to Definition & Peek Definition across files
  - Automatic Module Instantiation when typing
- Language Server support (experimental) from:
  - [svls](https://github.com/dalance/svls)
  - [veridian](https://github.com/vivekmalneedi/veridian)
  - [HDL Checker](https://github.com/suoto/hdl_checker)
  - [verible-verilog-ls](https://github.com/chipsalliance/verible)
  - [rust_hdl](https://github.com/VHDL-LS/rust_hdl)
- Formatting support from:
  - [verible-verilog-format](https://github.com/chipsalliance/verible)
  - [verilog-format](https://github.com/ericsonj/verilog-format)
  - [istyle-verilog-formatter](https://github.com/thomasrussellmurphy/istyle-verilog-formatter)

## Recommended Configuration

### Install [universal-ctags](https://github.com/universal-ctags/ctags)

Use >= 6.1 for port definition support

- Windows - Release are [here](https://github.com/universal-ctags/ctags-win32/releases)
- Linux - Releases are [here](https://github.com/universal-ctags/ctags/releases/)
- macOS - Install through Homebrew: ```brew install universal-ctags```

### Install [slang](https://github.com/MikePopoloski/slang)

This is the best linter to use, as it's the [fastest and most compliant](https://github.com/MikePopoloski/slang?tab=readme-ov-file#:~:text=slang%20is%20the%20fastest%20and%20most%20compliant%20SystemVerilog%20frontend%20(according%20to%20the%20open%20source%20chipsalliance%20test%20suite).) language frontend.

### Example Configuration

```


```

Explore all configuation options [here](CONFIG.md)



## Why should I use this over the original?

This was forked off of https://github.com/mshr-h/vscode-verilog-hdl-support because I wanted to move faster with shipping features, and refine the focus on system verilog and large monorepos.

Since forking, these features have been added:
- port definitions
- autocomplete module/interface while typing (Module #( will trigger completion)
- multiple linter support
- fixed verilator lint
- more precise slang and verilator lint ranges
- greatly improved hover performance
- format on save for specified directories
- simplified configuration

There's a lot more planned as well:
- expanded hover support for hierarchical references
- slang language server
- project selection, instance selection
- multitool defines support
- expand macros on hover
- context aware inlay hints for elaboration


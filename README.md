# Verilog/SystemVerilog Tools

Verilog and SystemVerilog support including linting from popular tools, completions, formatting, waveform viewer, and project level analysis.

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items/AndrewNolte.vscode-system-verilog)

<!-- 
[![Install Count](https://img.shields.io/visual-studio-marketplace/i/AndrewNolte.vscode-system-verilog)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog)
[![Download Count](https://img.shields.io/visual-studio-marketplace/d/AndrewNolte.vscode-system-verilog.png)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog) -->

![sample](images/sample.gif)

## Linters 
### [`slang`](https://github.com/MikePopoloski/slang) (recommended) || [`iverilog`](https://github.com/steveicarus/iverilog) (Icarus) || [`verilator`](https://github.com/verilator/verilator) ||  [`modelsim`](https://eda.sw.siemens.com/en-US/ic/modelsim/) || [`xvlog`](https://www.xilinx.com/products/design-tools/vivado.html) (Xilinx/Vivado)

  The extension will make symlinks to all sv files in .sv_cache/files, and then pass that to tools with the -y flag so they can discover modules without the need for individual build configs. This can be disabled with `verilog.index.enableSymlinks: false`


## Formatters

### [`verible-verilog-format`](https://github.com/chipsalliance/verible/tree/master/verilog/formatting) (recommended) || [`verilog-format`](https://github.com/ericsonj/verilog-format) || [`istyle`](https://github.com/thomasrussellmurphy/istyle-verilog-formatter)


Verible supports both SystemVerilog and Verilog, while the others are only verilog. `verilog.formatDirs` lets you specify directories that you want to format on save, or you can use the global formatOnSave option for verilog/systemverilog.

## Language Servers

###  Built-in language server

<img src="images/completion.gif" alt="Alt text" width="50%"/> -->

- Document symbols outline
- Hover and definitions across files, including macros defined in svh files or whatever you choose to pre-index
- Code completion for modules on "ModuleName #"
- Zero config required if module names match file
- Code completion suggests relevant symbols- package refs, params, ports, macros, builtins, etc.
- Hover and Completion for builtin functions like $bits()

#### Third party options: [`verible-verilog-ls`](https://github.com/chipsalliance/verible/tree/master/verilog/tools/ls) || [`veridian`](https://github.com/vivekmalneedi/veridian) || [`svls`](https://github.com/dalance/svls)


## Fst/Vcd/Ghw support from [Surfer](https://surfer-project.org/)
<img src="images/surfer.png" width="50%"/>

## Recommended SystemVerilog Configuration

### Install [universal-ctags](https://github.com/universal-ctags/ctags)

This is used for definition support, hover support, and most of the analysis features.

Use 6.1 or later for port/param definition support

- Windows - Release are [here](https://github.com/universal-ctags/ctags-win32/releases)
- Linux - Releases are [here](https://github.com/universal-ctags/ctags/releases/)
- macOS - Install through Homebrew: ```brew install universal-ctags```

### Install [slang](https://github.com/MikePopoloski/slang)




This is the recommended linter because it's the [fastest and most compliant](https://github.com/MikePopoloski/slang?tab=readme-ov-file#:~:text=slang%20is%20the%20fastest%20and%20most%20compliant%20SystemVerilog%20frontend%20(according%20to%20the%20open%20source%20chipsalliance%20test%20suite).) language frontend, and it has very precise error messages.

### Example Configuration

```json
// these get passed to linters and other tools with -I, or the correct format for that tool
"verilog.includes": [
    "hdl/lib",
    "hdl/includes"
],
"verilog.ctags.path": "/usr/local/bin/ctags-universal",
"verilog.lint.slang.enabled": true,
// includes and '-y .sv_cache/files' are already passed to linters
"verilog.lint.slang.args": "--error-limit 200",
"verilog.lint.slang.path": "/usr/local/bin/slang",
// multiple linters can run concurrently
"verilog.lint.verilator.enabled": true,
// tools will use the default name on the path if not given
"verilog.format.svFormatter": "verible-verilog-format",
"verilog.format.verible.args": "--flagfile=myflags.txt",
"verilog.format.verible.path": "/usr/local/bin/verible-verilog-format",
// select directories to format on save
"verilog.formatDirs": [
    "hdl/my/project/with/formatting"
],
```

### [All Config Options](CONFIG.md)

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
- Top level context
  - Select top level to brose hierarchy (not fully elaborated)
  - Lint the whole core, including elaboration
- autocomplete module/interface while typing - 'ModuleName #' will trigger completion
- format on save for directories specified in config
- simplified configuration

There's a lot more planned as well:
- expanded hover support for hierarchical references (ctags needs a fix)
- slang language server
- expand macros on hover + expansion command
- context aware inlay hints for elaboration
- project selection, build configs


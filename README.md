# Slang Server: a SystemVerilog Language Server

Verilog and SystemVerilog support including linting from popular tools, completions, formatting, and project level analysis.

Install it from the [VS Code Marketplace](https://marketplace.visualstudio.com/items/AndrewNolte.vscode-system-verilog) or [OpenVSX](https://open-vsx.org/extension/AndrewNolte/vscode-system-verilog)

<!--
[![Install Count](https://img.shields.io/visual-studio-marketplace/i/AndrewNolte.vscode-system-verilog)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog)
[![Download Count](https://img.shields.io/visual-studio-marketplace/d/AndrewNolte.vscode-system-slang.png)](https://marketplace.visualstudio.com/items?itemName=AndrewNolte.vscode-system-verilog) -->

## Language Server

Most of the features from the ctags version are here, with a couple exceptions

- No macro expansion yet
- No package or port/param completions yet

<!-- New features
- Select build.f file in instead of top level. This includes showing resolved types -->

### See a detailed feature list and roadmap in [FEATURES.md](FEATURES.md)

## Formatters

### [`verible-verilog-format`](https://github.com/chipsalliance/verible/tree/master/verilog/formatting) (recommended) || [`verilog-format`](https://github.com/ericsonj/verilog-format) || [`istyle`](https://github.com/thomasrussellmurphy/istyle-verilog-formatter)

Verible supports both SystemVerilog and Verilog, while the others are only slang. `slang.formatDirs` lets you specify directories that you want to be formatted.
In the future slang will have its own formatter.

<br>

### Example Configuration

Generic langauge server setup in `.slang-server.json`

```json
// these get passed to linters and other tools with -I, or the correct format for that tool
{
  "includes": ["hdl/lib", "hdl/includes"],
  "flags": "-Wno-sign-conversion"
}
```

For user configuation, you can add configs at `~/.slang-server.json` 

Shared language server repo configuration is at `.slang-server.local.json`


### See all vscode-specfic config options in [CONFIG.md](CONFIG.md)

For debugging vscode related issues, you can see the logs in Output tab > select 'Slang' in the dropdown
For debugging language server related issues, you can see logs in Ouptu tab > 'slang-server'

### Contributions are welcome, see [DEVELOPING.md](DEVELOPING.md)

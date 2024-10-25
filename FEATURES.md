# Features

Underlined features show what was available in the project this was based on: https://github.com/mshr-h/vscode-verilog-hdl-support

### Code complete
- <u>Symbols in the current file</u>
- ModuleName #
- PackageName::
- Builtins on $
- Ports/Params
- Macros and more

### Goto Defs
- <u>Symbols in current file</u>
- <u>Modules/Packages in the form ModuleName.sv</u>
- Module Ports/Params
- Macros and global symbols in .svh files
- In-memory lazy module cache, which makes everything a lot snappier
- Hierarchical references, interface array references
- jump to file on include directives

### Formatting
- <u>Verilog formatting provider</u>
- Format on save for specific directories

### Linting
- <u>Slang and Verilator linting</u>
- Managed symlink index in vscode storage, allowing tools to use -y on the index
- `verilog.includes` passed to all tools
- Parses lint width from tool instead of underlining whole line
- Parses slang instance paths when given
- Fixed Icarus linting on windows
- Xcelium Lint, terminal links for Xcelium's file/lineno format

### Top level context
- Lint an entire project with multiple linters
- Hierarchy View
  - Set top module
  - Toggle Params and Data in tree
  - Set Instance by Path
- Instances View
  - View each module in the design, and the instances of each
- Terminal links for hierarchical paths- opens paths in views and editor

### Analysis / Aesthetics
- Split view macro expansion
- Improvements to syntax highlighting
- Improve symbol tree generation and icon choice


<br>

# Future plans

### General
- Expand macros on hover
- Slang language server / Slang json parsing instead of ctags
- Improved codecomplete/defs for OOP/UVM

### Top level context
- Specify build.f file (defines, includes), not just top level
- Commmand to generate build.f file
- Hierarchical paths
  - instance selection
  - param inlay hints for selected instance
  - Fuzzy search for hierarchical paths
  - Jump to instance for hierarchical paths (lint, terminal output)
- Open instance/file from waveform viewer
- Open waveform viewer from instance signal

### Lint
- VCS Lint

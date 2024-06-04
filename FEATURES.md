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

### Formatting
- <u>Verilog formatting provider</u>
- Format on save for specific dirs

### Linting
- <u>Slang and Verilator linting</u>
- Managed symlink index in `.sv_cache/files`, allowing module discovery
- `verilog.includes` passed to all tools
- Parses lint width from tool instead of underlining whole line
- Fixed Icarus linting on windows

### Top level context
- Lint an entire project
- Explore module hierarchy

### Analysis
- Split view macro expansion

<br>

# Future plans

### General
- Goto defs on includes
- Expand macros on hover
- Slang language server
- Improved codecomplete/defs for OOP/UVM

### Top level context
- Specify build.f file (defines, param overrides), not just top level
- Specify flags for each tool
- Generate build.f file
- Hierarchical paths
  - instance selection
  - param inlay hints for selected instance
  - Fuzzy search for hierarchical paths
  - paths in terminal link to instance

### Lint
- Xcelium Lint
- VCS Lint

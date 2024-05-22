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
- In-memory lazy module cache, makes everything a lot snappier
- Hierarchical references, interface array references

### Formatting
- <u>Verilog formatting provider</u>
- Format on save for specific dirs

### Linting
- <u>Slang and Verilator linting</u>
- Managed symlink index in `.sv_cache/files`
- Verilog.includes passed to all tools
- Parses lint width as well instead of showing whole line

### Top level context
- Lint an entire project
- Explore module hierarchy

<br>

# Future plans

### General
- Goto defs on includes
- Expand macros on hover / Inlay hints
- Split view macro expansion
- Slang language server
- Improved codecomplete/defs for OOP/UVM

### Top level context
- Specify build.f file, not just top level
- Specify flags for each tool
- Provide terminal links for hierarchy
- Generate build.f file
- Fuzzy search for hierarchical references
- Need to start async index process when setting top level
- Slang json
- Inlay hints for params from slang json
- Select instance

### Lint
- Add Xcelium Lint
- Add VCS Lint
- Support Verilator packages via topo sort

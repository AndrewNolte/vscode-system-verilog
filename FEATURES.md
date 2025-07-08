# Features

### Code complete

- ModuleName #
- Macros
- TOOO
  - symbols in scope
  - PackageName::
  - Builtins on $
  - Ports/Params

### Goto Defs

- On nearly every symbol except for some edge cases that will be addressed.
- TODO:
  - Macro expansions in hover
  - Split view macro expansion

### Formatting

- Format on save for specific directories using verible's formatter

### Linting

- Snappy slang linting
- Parse-level lints on change (while typing), deeper lints ran on save
- TODO: 
  - Run other linters through generated or given filelist

### Top level context

- Lint an entire project
- Hierarchy View
  - Set top module or filelist
  - Toggle Params and Data in tree
  - See resolved param types
  - Set Instance by Path
- Instances View
  - View each module in the design, and the instances of each
- TODO:
  - Terminal links for hierarchical paths- opens paths in views and editor
  - Context aware hovers/inlays for selected instance of modules
  - Open instance/file from waveform viewer 
  - Open waveform viewer from instance signal
  - Commmand to generate build.f file given top level


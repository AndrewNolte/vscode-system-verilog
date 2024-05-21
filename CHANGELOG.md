# Changelog

## [0.9.11] - 2024-05-20
- Remove HDL support, rename title, refine focus on systemverilog/verilog
- Fix icarus lint parser
- Fix windows and wsl code, removes need for "useWSL" config
- Fix project-level file paths for verilator lint
- Fix initial include file indexing, needed some retries

## [0.9.10] - 2024-05-14
- side panel to select top level
- lint whole project using top level context
- FST, VCD, GHW support from surfer (Pull request for FST support on theirs was not getting merged, so I merged it here)
- fix bug with no lint args being configured
- warn on incompatible extensions
- warn on formatDirs not being used
- warn on invalid linter path

## [0.9.9] - 2024-05-01
- Fix builtins
- Add space in args for macro autocomplete

## [0.9.8] - 2024-04-29
- Rewrite document symbol provider
  - Leverage parent pointers from ctags
  - Provide better icons, particularly for instances
- Revamp Code completions
  - Module inst triggers on #, in order to support the completion adding the semicolon at the end
  - Module completion parameter values now default to the default values
  - Hover/Completions for Builtins
  - Macro Completions
  - Package:: completions
  - filtered symbol completions on '[' ad ':'
  - Parameter/Port completions on '.' when in a Module Inst
  - Hierarchical reference completions (interface.x)

## [0.9.7] - 2024-04-28

- verlog on verible-ls (upstream fix)
- clear diagnostics on config change
- improved logging
- fix interface array ref hover/definition
- Improve Verilator package resolution
  - Verilator requires packages be specified beforehand, so this will iterate the verilator lint step, prepending packages that it complains about. More work should be done on this to produce a topo sort of the packages
- use execFile for ctags (no shell)
- Add index component 
  - symlink index (.sv_cache/files)
  - in-memory file index, makes everything much much snappier

## [0.9.6] - 2024-04-19

- fix large hover size on some types
- fix unwanted nested hovers
- fix unneeded file linting on startup
- Lint messages follow width from Slang and Verilator
  - If lint width is small, it will underline the word at that position
- Support deeper package refs
- Format on save support
- Fix indenting of some hovers
- Large code refactors
  - Type safe config management library

## [0.9.5] - 2024-04-12
- Fix linting issue from 9.4

## [0.9.4] - 2024-04-11 - Initial Release
- remove BSV code
- module and interface autocomplete
- index include paths, macros
- nested hover (hover will search first hover for additional variables)
- code clean up
  - strict typing
  - better formatting presets
  - convert everything to async/await
  - linter refactor, consolodate repeated code

## Fork point

For previous work, refer to https://github.com/mshr-h/vscode-verilog-hdl-support/blob/main/CHANGELOG.md
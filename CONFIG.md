# Configuration Settings

- `slang.svStandard`: string = "SystemVerilog-2017"

  System Verilog standard to use for external linters

  Options:
  - SystemVerilog-2005
  - SystemVerilog-2009
  - SystemVerilog-2012
  - SystemVerilog-2017
- `slang.verilogStandard`: string = "Verilog-2005"

  Verilog standard to use for external linters

  Options:
  - Verilog-95
  - Verilog-2001
  - Verilog-2005
- `slang.formatDirs`: array = []

  Directories to format

- `slang.svFormat.verible.runAtFileLocation`: boolean = false

  Run at file location

- `slang.svFormat.verible.args`: string = ""

  Arguments to pass to the tool

- `slang.svFormat.verible.path`: path

  Platform Defaults:

    linux:   `verible-verilog-format`

    mac:     `verible-verilog-format`

    windows: `verible-verilog-format.exe`

- `slang.svFormat.formatter`: string = ""

  Formatter Selection

  Options:
  - verible-verilog-format
- `slang.verilogFormat.verilogFormatter.runAtFileLocation`: boolean = false

  Run at file location

- `slang.verilogFormat.verilogFormatter.args`: string = ""

  Arguments to pass to the tool

- `slang.verilogFormat.verilogFormatter.path`: path

  Platform Defaults:

    linux:   `verilogFormat`

    mac:     `verilogFormat`

    windows: `verilogFormat.exe`

- `slang.verilogFormat.iStyleFormatter.runAtFileLocation`: boolean = false

  Run at file location

- `slang.verilogFormat.iStyleFormatter.args`: string = ""

  Arguments to pass to the tool

- `slang.verilogFormat.iStyleFormatter.path`: path

  Platform Defaults:

    linux:   `istyleFormat`

    mac:     `istyleFormat`

    windows: `istyleFormat.exe`

- `slang.verilogFormat.veribleFormatter.runAtFileLocation`: boolean = false

  Run at file location

- `slang.verilogFormat.veribleFormatter.args`: string = ""

  Arguments to pass to the tool

- `slang.verilogFormat.veribleFormatter.path`: path

  Platform Defaults:

    linux:   `verible`

    mac:     `verible`

    windows: `verible.exe`

- `slang.verilogFormat.formatter`: string = ""

  Formatter Selection

  Options:
  - verilog-format
  - istyle-format
  - verible-verilog-format
- `slang.rewriterPath`: string = ""

  Path to the rewriter script (typically slang rewriter binary with --expand-macros flag)

- `slang.path`: path

  Platform Defaults:

    linux:   `slang-server`

    mac:     `slang-server`

    windows: `slang-server.exe`

- `slang.args`: array = []

  Arguments to pass to the slang-server

- `slang.debugArgs`: array = []

  Arguments to pass to slang-server when debugging


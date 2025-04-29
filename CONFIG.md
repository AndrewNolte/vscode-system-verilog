## Configuration Settings

- `slang.index.enableSymlinks`: boolean = true

    Enable creating file symlinks in .sv_cache/files for the -y flag that most tools have. Created in a per-workspace exteneral directory that vscode provides


- `slang.index.indexAllIncludes`: boolean = false

    Whether to index all .svh files


- `slang.includes`: array = []

    Include paths to pass as -I to tools


- `slang.moduleGlobs`: array = []

    Globs for finding verilog modules, interfaces, and packages for use with the common -y flag


- `slang.excludeGlob`: string = ""

    Globs to exclude files


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


- `slang.expandMacroScript`: string = ""

    Script to expand macros. Takes the file as an argument, expects output on stdout


- `slang.lint.modelsim.runAtFileLocation`: boolean = false

    Run at file location


- `slang.lint.modelsim.args`: string = ""

    Arguments to pass to the tool


- `slang.lint.modelsim.path`: path

  Platform Defaults:

    linux:   `modelsim`

    mac:     `modelsim`

    windows: `modelsim.exe`


- `slang.lint.modelsim.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `slang.lint.modelsim.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `slang.lint.modelsim.enabled`: boolean = false

    Enable this lint tool


- `slang.lint.modelsim.work`: string = "work"

    Modelsim work library


- `slang.lint.iverilog.runAtFileLocation`: boolean = false

    Run at file location


- `slang.lint.iverilog.args`: string = ""

    Arguments to pass to the tool


- `slang.lint.iverilog.path`: path

  Platform Defaults:

    linux:   `iverilog`

    mac:     `iverilog`

    windows: `iverilog.exe`


- `slang.lint.iverilog.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `slang.lint.iverilog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `slang.lint.iverilog.enabled`: boolean = false

    Enable this lint tool


- `slang.lint.verilator.runAtFileLocation`: boolean = false

    Run at file location


- `slang.lint.verilator.args`: string = ""

    Arguments to pass to the tool


- `slang.lint.verilator.path`: path

  Platform Defaults:

    linux:   `verilator`

    mac:     `verilator`

    windows: `verilator.exe`


- `slang.lint.verilator.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `slang.lint.verilator.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `slang.lint.verilator.enabled`: boolean = false

    Enable this lint tool


- `slang.lint.xvlog.runAtFileLocation`: boolean = false

    Run at file location


- `slang.lint.xvlog.args`: string = ""

    Arguments to pass to the tool


- `slang.lint.xvlog.path`: path

  Platform Defaults:

    linux:   `xvlog`

    mac:     `xvlog`

    windows: `xvlog.exe`


- `slang.lint.xvlog.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `slang.lint.xvlog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `slang.lint.xvlog.enabled`: boolean = false

    Enable this lint tool


- `slang.lint.xcelium.runAtFileLocation`: boolean = false

    Run at file location


- `slang.lint.xcelium.args`: string = ""

    Arguments to pass to the tool


- `slang.lint.xcelium.path`: path

  Platform Defaults:

    linux:   `xrun`

    mac:     `xrun`

    windows: `xrun.exe`


- `slang.lint.xcelium.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `slang.lint.xcelium.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `slang.lint.xcelium.enabled`: boolean = false

    Enable this lint tool


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

- `slang.path`: path

  Platform Defaults:

    linux:   `slang-server`

    mac:     `slang-server`

    windows: `slang-server.exe`


- `slang.args`: array = []

    Arguments to pass to the slang-server


- `slang.debugArgs`: array = []

    Arguments to pass to slang-server when debugging



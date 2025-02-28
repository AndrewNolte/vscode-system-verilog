## Configuration Settings

- `verilog.index.enableSymlinks`: boolean = true

    Enable creating file symlinks in .sv_cache/files for the -y flag that most tools have. Created in a per-workspace exteneral directory that vscode provides


- `verilog.index.indexAllIncludes`: boolean = false

    Whether to index all .svh files


- `verilog.ctags.enabled`: boolean = true

    Enable ctags indexing


- `verilog.ctags.path`: path

  Platform Defaults:

    linux:   `ctags-universal`

    mac:     `ctags`

    windows: `ctags.exe`


- `verilog.ctags.indexAllIncludes`: boolean = false

    (Deprecated) Use `verilog.index.IndexAllIncludes` instead


- `verilog.includes`: array = []

    Include paths to pass as -I to tools


- `verilog.moduleGlobs`: array = []

    Globs for finding verilog modules, interfaces, and packages for use with the common -y flag


- `verilog.includeGlobs`: array = []

    Globs for finding verilog include files (typically svh), used for definition providing. If set to [], it will source from verilog.includes


- `verilog.excludeGlob`: string = ""

    Globs to exclude files


- `verilog.svStandard`: string = "SystemVerilog-2017"

    System Verilog standard to use

    Options:
    - SystemVerilog-2005
    - SystemVerilog-2009
    - SystemVerilog-2012
    - SystemVerilog-2017

- `verilog.verilogStandard`: string = "Verilog-2005"

    System Verilog standard to use

    Options:
    - Verilog-95
    - Verilog-2001
    - Verilog-2005

- `verilog.formatDirs`: array = []

    Directories to format


- `verilog.expandMacroScript`: string = ""

    Script to expand macros. Takes the file as an argument, expects output on stdout


- `verilog.lint.slang.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.slang.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.slang.path`: path

  Platform Defaults:

    linux:   `slang`

    mac:     `slang`

    windows: `slang.exe`


- `verilog.lint.slang.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `verilog.lint.slang.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.slang.enabled`: boolean = true

    Enable this lint tool


- `verilog.lint.modelsim.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.modelsim.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.modelsim.path`: path

  Platform Defaults:

    linux:   `modelsim`

    mac:     `modelsim`

    windows: `modelsim.exe`


- `verilog.lint.modelsim.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `verilog.lint.modelsim.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.modelsim.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.modelsim.work`: string = "work"

    Modelsim work library


- `verilog.lint.iverilog.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.iverilog.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.iverilog.path`: path

  Platform Defaults:

    linux:   `iverilog`

    mac:     `iverilog`

    windows: `iverilog.exe`


- `verilog.lint.iverilog.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `verilog.lint.iverilog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.iverilog.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.verilator.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.verilator.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.verilator.path`: path

  Platform Defaults:

    linux:   `verilator`

    mac:     `verilator`

    windows: `verilator.exe`


- `verilog.lint.verilator.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `verilog.lint.verilator.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.verilator.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.xvlog.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.xvlog.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.xvlog.path`: path

  Platform Defaults:

    linux:   `xvlog`

    mac:     `xvlog`

    windows: `xvlog.exe`


- `verilog.lint.xvlog.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `verilog.lint.xvlog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.xvlog.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.xcelium.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.xcelium.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.xcelium.path`: path

  Platform Defaults:

    linux:   `xrun`

    mac:     `xrun`

    windows: `xrun.exe`


- `verilog.lint.xcelium.projectEnabled`: boolean = false

    Enable this linter only when the project is selected


- `verilog.lint.xcelium.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.xcelium.enabled`: boolean = false

    Enable this lint tool


- `verilog.svFormat.verible.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.svFormat.verible.args`: string = ""

    Arguments to pass to the tool


- `verilog.svFormat.verible.path`: path

  Platform Defaults:

    linux:   `verible-verilog-format`

    mac:     `verible-verilog-format`

    windows: `verible-verilog-format.exe`


- `verilog.svFormat.formatter`: string = ""

    Formatter Selection

    Options:
    - verible-verilog-format

- `verilog.verilogFormat.verilogFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.verilogFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.verilogFormatter.path`: path

  Platform Defaults:

    linux:   `verilogFormat`

    mac:     `verilogFormat`

    windows: `verilogFormat.exe`


- `verilog.verilogFormat.iStyleFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.iStyleFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.iStyleFormatter.path`: path

  Platform Defaults:

    linux:   `istyleFormat`

    mac:     `istyleFormat`

    windows: `istyleFormat.exe`


- `verilog.verilogFormat.veribleFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.veribleFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.veribleFormatter.path`: path

  Platform Defaults:

    linux:   `verible`

    mac:     `verible`

    windows: `verible.exe`


- `verilog.verilogFormat.formatter`: string = ""

    Formatter Selection

    Options:
    - verilog-format
    - istyle-format
    - verible-verilog-format

- `verilog.languageServer.svls.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.svls.args`: array = []

    Arguments to pass to the server


- `verilog.languageServer.svls.path`: string = "svls"

    


- `verilog.languageServer.veridian.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.veridian.args`: array = []

    Arguments to pass to the server


- `verilog.languageServer.veridian.path`: string = "veridian"

    


- `verilog.languageServer.veribleVerilogLs.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.veribleVerilogLs.args`: array = []

    Arguments to pass to the server


- `verilog.languageServer.veribleVerilogLs.path`: string = "verible-verilog-ls"

    


- `verilog.languageServer.slang.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.slang.args`: array = []

    Arguments to pass to the server


- `verilog.languageServer.slang.path`: string = "slang-server"

    


- `verilog.inlayHints.wildcardPorts`: string = "on"

    Show wildcard port hints (.*: port1, port2, etc.) in module instantiation

    Options:
    - on
    - off

- `verilog.inlayHints.ports`: string = "off"

    Show port type hints in module instantiation

    Options:
    - on
    - hover
    - off


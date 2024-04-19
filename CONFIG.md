## Configuration Settings

- `verilog.ctags.path`: string = "ctags"

    Path to ctags universal executable


- `verilog.ctags.indexAllIncludes`: boolean = false

    Whether to index all .svh files


- `verilog.includes`: array = []

    Include Paths for tools


- `verilog.directory`: string = ""

    The directory containing all hardware files


- `verilog.lint.slang.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.slang.useWsl`: boolean = false

    Run using wsl


- `verilog.lint.slang.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.slang.path`: string = "slang"

    Path to the tool


- `verilog.lint.slang.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.slang.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.modelsim.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.modelsim.useWsl`: boolean = false

    Run using wsl


- `verilog.lint.modelsim.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.modelsim.path`: string = "modelsim"

    Path to the tool


- `verilog.lint.modelsim.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.modelsim.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.modelsim.work`: string = "work"

    Modelsim work library


- `verilog.lint.iverilog.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.iverilog.useWsl`: boolean = false

    Run using wsl


- `verilog.lint.iverilog.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.iverilog.path`: string = "iverilog"

    Path to the tool


- `verilog.lint.iverilog.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.iverilog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.verilator.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.verilator.useWsl`: boolean = false

    Run using wsl


- `verilog.lint.verilator.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.verilator.path`: string = "verilator"

    Path to the tool


- `verilog.lint.verilator.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.verilator.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.xvlog.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.xvlog.useWsl`: boolean = false

    Run using wsl


- `verilog.lint.xvlog.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.xvlog.path`: string = "xvlog"

    Path to the tool


- `verilog.lint.xvlog.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.xvlog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.svFormat.verible.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.svFormat.verible.useWsl`: boolean = false

    Run using wsl


- `verilog.svFormat.verible.args`: string = ""

    Arguments to pass to the tool


- `verilog.svFormat.verible.path`: string = "verible-verilog-format"

    Path to the tool


- `verilog.svFormat.formatter`: string = "verible-verilog-format"

    Formatter Selection


- `verilog.verilogFormat.verilogFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.verilogFormatter.useWsl`: boolean = false

    Run using wsl


- `verilog.verilogFormat.verilogFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.verilogFormatter.path`: string = "verilogFormat"

    Path to the tool


- `verilog.verilogFormat.iStyleFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.iStyleFormatter.useWsl`: boolean = false

    Run using wsl


- `verilog.verilogFormat.iStyleFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.iStyleFormatter.path`: string = "istyleFormat"

    Path to the tool


- `verilog.verilogFormat.veribleFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.veribleFormatter.useWsl`: boolean = false

    Run using wsl


- `verilog.verilogFormat.veribleFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.veribleFormatter.path`: string = "verible"

    Path to the tool


- `verilog.verilogFormat.formatter`: string = "verible-verilog-format"

    Formatter Selection


- `verilog.svStandard`: enum = SystemVerilog-2017

    System Verilog standard to use

    Options:
    - SystemVerilog-2005
    - SystemVerilog-2009
    - SystemVerilog-2012
    - SystemVerilog-2017

- `verilog.verilogStandard`: enum = Verilog-2005

    System Verilog standard to use

    Options:
    - Verilog-95
    - Verilog-2001
    - Verilog-2005

- `verilog.formatDirs`: array = []

    Directories to format


- `verilog.languageServer.svls.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.svls.path`: string = "svls"

    


- `verilog.languageServer.veridian.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.veridian.path`: string = "veridian"

    


- `verilog.languageServer.hdlChecker.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.hdlChecker.path`: string = "hdl_checker"

    


- `verilog.languageServer.veribleVerilogLs.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.veribleVerilogLs.path`: string = "verible-verilog-ls"

    


- `verilog.languageServer.rustHdl.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.rustHdl.path`: string = "rust_hdl"

    



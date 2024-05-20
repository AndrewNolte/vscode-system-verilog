## Configuration Settings

- `verilog.index.enableSymlinks`: boolean = true

    Enable creating file symlinks in .sv_cache/files for the -y flag that most tools have


- `verilog.ctags.path`: string = "{"windows":"ctags.exe","linux":"ctags-universal","mac":"ctags"}"

    Path to ctags universal executable


- `verilog.ctags.indexAllIncludes`: boolean = false

    Whether to index all .svh files


- `verilog.includes`: array = []

    Include paths to pass as -I to tools


- `verilog.moduleGlobs`: array = []

    Globs for finding verilog modules, interfaces, and packages for use with the common -y flag


- `verilog.includeGlobs`: array = []

    Globs for finding verilog include files (typically svh), used for definition providing. If set to [], it will source from verilog.includes


- `verilog.excludeGlob`: string = ""

    Globs to exclude files


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


- `verilog.lint.slang.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.slang.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.slang.path`: string = "{"windows":"slang.exe","linux":"slang","mac":"slang"}"

    Path to the tool


- `verilog.lint.slang.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.slang.enabled`: boolean = true

    Enable this lint tool


- `verilog.lint.modelsim.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.modelsim.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.modelsim.path`: string = "{"windows":"modelsim.exe","linux":"modelsim","mac":"modelsim"}"

    Path to the tool


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


- `verilog.lint.iverilog.path`: string = "{"windows":"iverilog.exe","linux":"iverilog","mac":"iverilog"}"

    Path to the tool


- `verilog.lint.iverilog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.iverilog.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.verilator.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.verilator.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.verilator.path`: string = "{"windows":"verilator.exe","linux":"verilator","mac":"verilator"}"

    Path to the tool


- `verilog.lint.verilator.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.verilator.enabled`: boolean = false

    Enable this lint tool


- `verilog.lint.xvlog.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.lint.xvlog.args`: string = ""

    Arguments to pass to the tool


- `verilog.lint.xvlog.path`: string = "{"windows":"xvlog.exe","linux":"xvlog","mac":"xvlog"}"

    Path to the tool


- `verilog.lint.xvlog.includes`: array = []

    Include Path Overrides. Use `${includes} to include default includes


- `verilog.lint.xvlog.enabled`: boolean = false

    Enable this lint tool


- `verilog.svFormat.verible.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.svFormat.verible.args`: string = ""

    Arguments to pass to the tool


- `verilog.svFormat.verible.path`: string = "{"windows":"verible-verilog-format.exe","linux":"verible-verilog-format","mac":"verible-verilog-format"}"

    Path to the tool


- `verilog.svFormat.formatter`: string = "verible-verilog-format"

    Formatter Selection


- `verilog.verilogFormat.verilogFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.verilogFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.verilogFormatter.path`: string = "{"windows":"verilogFormat.exe","linux":"verilogFormat","mac":"verilogFormat"}"

    Path to the tool


- `verilog.verilogFormat.iStyleFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.iStyleFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.iStyleFormatter.path`: string = "{"windows":"istyleFormat.exe","linux":"istyleFormat","mac":"istyleFormat"}"

    Path to the tool


- `verilog.verilogFormat.veribleFormatter.runAtFileLocation`: boolean = false

    Run at file location


- `verilog.verilogFormat.veribleFormatter.args`: string = ""

    Arguments to pass to the tool


- `verilog.verilogFormat.veribleFormatter.path`: string = "{"windows":"verible.exe","linux":"verible","mac":"verible"}"

    Path to the tool


- `verilog.verilogFormat.formatter`: string = "verible-verilog-format"

    Formatter Selection


- `verilog.languageServer.svls.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.svls.path`: string = "svls"

    


- `verilog.languageServer.veridian.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.veridian.path`: string = "veridian"

    


- `verilog.languageServer.veribleVerilogLs.enabled`: boolean = false

    Enable this Language Server


- `verilog.languageServer.veribleVerilogLs.path`: string = "verible-verilog-ls"

    



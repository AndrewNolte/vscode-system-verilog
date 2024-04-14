import { ExtensionComponent, ConfigObject } from './libconfig'

export class Runner extends ExtensionComponent {
  runAtFileLocation: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Run at file location',
  })
  useWsl: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Run using wsl',
  })
}

export class ToolConfig extends Runner {
  path: ConfigObject<string>
  args: ConfigObject<string> = new ConfigObject({
    default: '',
    description: 'Arguments to pass to the tool',
  })
  toolName: string
  constructor(toolName: string) {
    super()
    this.toolName = toolName
    this.path = new ConfigObject({
      default: toolName,
      description: 'Path to the tool',
    })
  }
}

export class ToggleToolConfig extends ToolConfig {
  enabled: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: 'Enable this tool',
  })
}

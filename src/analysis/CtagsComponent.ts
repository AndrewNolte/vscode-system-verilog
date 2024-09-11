// SPDX-License-Identifier: MIT
import { ConfigObject, ExtensionComponent, PathConfigObject } from '../lib/libconfig'

export class CtagsComponent extends ExtensionComponent {
  path: PathConfigObject = new PathConfigObject(
    {
      description: 'Path to ctags universal executable',
    },
    {
      windows: 'ctags.exe',
      linux: 'ctags-universal',
      mac: 'ctags',
    }
  )

  indexAllIncludes: ConfigObject<boolean> = new ConfigObject({
    default: false,
    description: '(Deprecated) Use `verilog.index.IndexAllIncludes` instead',
  })
}

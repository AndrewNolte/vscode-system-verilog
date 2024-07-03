import path from 'path'
import { ConfigObject } from './lib/libconfig'
import { getWorkspaceFolder } from './utils'
import fs = require('fs')
export class IncludeConfig extends ConfigObject<string[]> {
  resolve(p: string): string | undefined {
    for (let incdir in this.getValue()) {
      let fullpath: string
      if (path.isAbsolute(incdir)) {
        // path.isAbsolute(incdir)
        // return vscode.Uri.file()
        fullpath = path.join(incdir, p)
      } else {
        const wsFolder = getWorkspaceFolder()
        if (wsFolder === undefined) {
          continue
        }
        fullpath = path.join(wsFolder, incdir, p)
      }
      // TODO: parallelize these calls
      if (fs.existsSync(fullpath)) {
        return fullpath
      }
    }
    return undefined
  }
}

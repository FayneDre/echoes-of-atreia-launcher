import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What an install carries on its own, so that nothing is asked of the machine: its Java in `<install>\runtime` and its MySQL in
 * `<install>\mysql`. The server's scripts make both (package-java.ps1, package-mysql.ps1 and setup-mysql.ps1); a folder that is not there
 * leaves the launcher on the machine's own Java and MySQL, as it always was.
 */

export interface OwnJava {
  /** The java program of the install's runtime. */
  executable: string
  /** Its folder, which goes first in the PATH the servers are started with. */
  binDir: string
}

export interface OwnMysql {
  /** The folder of mysqld, mysqladmin, mysqldump and mysql. */
  binDir: string
  /** The my.ini setup-mysql.ps1 wrote: its port, its data folder and the light settings. */
  optionsFile: string
}

export function ownJavaOf(root: string | null | undefined): OwnJava | null {
  if (!root) {
    return null
  }
  const binDir = join(root, 'runtime', 'bin')
  const executable = join(binDir, process.platform === 'win32' ? 'java.exe' : 'java')
  return existsSync(executable) ? { executable, binDir } : null
}

export function ownMysqlOf(root: string | null | undefined): OwnMysql | null {
  if (!root) {
    return null
  }
  const binDir = join(root, 'mysql', 'bin')
  const optionsFile = join(root, 'mysql', 'my.ini')
  // both: a bin folder without its my.ini is a MySQL that setup-mysql.ps1 has not set up, and starting it would make no database
  return existsSync(join(binDir, 'mysqld.exe')) && existsSync(optionsFile) ? { binDir, optionsFile } : null
}

/** A copy of the environment with a folder first in the PATH, under the name the system gave it (Windows has `Path`, and a second `PATH` would be ignored). */
export function withPathFirst(env: NodeJS.ProcessEnv, folder: string): NodeJS.ProcessEnv {
  const name = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH'
  const separator = process.platform === 'win32' ? ';' : ':'
  return { ...env, [name]: env[name] ? `${folder}${separator}${env[name]}` : folder }
}

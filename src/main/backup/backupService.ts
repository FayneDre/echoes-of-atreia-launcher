import { execFile, spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BackupSummary, Problem } from '../../shared/types'
import { addressOf, type DatabaseAddress } from '../accounts/accountStore'
import type { ServerLayout } from '../server/installation'
import { findMysqlBinDir } from '../server/mysql'

// A backup's folder is its date, and nothing else is ever read or removed: a name from the interface cannot reach outside the folder.
const BACKUP_ID = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?$/
const META_FILE = 'backup.json'
const STDERR_KEPT = 4000

interface Tool {
  command: string
  prefixArgs: string[]
  env: NodeJS.ProcessEnv
}

interface BackupMeta {
  createdAt: string
  kind: BackupSummary['kind']
  databases: { name: string; file: string; bytes: number }[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * `mysqldump` and `mysql`, from the folder of the MySQL service's own server, else from the PATH. The end-to-end tests set
 * ECHOES_FAKE_MYSQL_TOOLS to a folder of scripts that play them.
 */
async function mysqlTools(): Promise<{ dump: Tool; client: Tool }> {
  const fake = process.env['ECHOES_FAKE_MYSQL_TOOLS']
  if (fake) {
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    return {
      dump: { command: process.execPath, prefixArgs: [join(fake, 'fake-mysqldump.mjs')], env },
      client: { command: process.execPath, prefixArgs: [join(fake, 'fake-mysql.mjs')], env }
    }
  }
  const bin = await findMysqlBinDir()
  const resolve = async (name: string): Promise<string> => {
    const local = bin ? join(bin, `${name}.exe`) : null
    return local && (await exists(local)) ? local : name
  }
  return {
    dump: { command: await resolve('mysqldump'), prefixArgs: [], env: process.env },
    client: { command: await resolve('mysql'), prefixArgs: [], env: process.env }
  }
}

/**
 * The options this `mysqldump` needs and knows, read from its own help, since an option it does not know makes it fail and not every version
 * has them:
 * - `--set-gtid-purged=OFF`: with GTIDs on (MySQL's default since 8.0), `--single-transaction` otherwise flushes the tables, which asks for
 *   the RELOAD privilege the servers' database user does not have. MariaDB's has no such option.
 * - `--skip-masking-policies`: recent MySQL dumps masking policies, read from a system table the servers' user may not read.
 */
export function dumpOptionsFrom(help: string): string[] {
  const options: string[] = []
  if (help.includes('--set-gtid-purged')) {
    options.push('--set-gtid-purged=OFF')
  }
  if (help.includes('--masking-policies')) {
    options.push('--skip-masking-policies')
  }
  return options
}

function dumpOptions(dump: Tool): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(dump.command, [...dump.prefixArgs, '--help'], { env: dump.env, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (_error, stdout) =>
      resolve(dumpOptionsFrom(String(stdout)))
    )
  })
}

/** The local date and time as a folder name: sorts as it reads. */
export function backupIdFor(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_` +
    `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

/** A value of a MySQL option file, quoted so a password with spaces, quotes, `#` or backslashes reads back as it is. */
export function optionValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Runs a MySQL tool with the credentials in an option file of its own, never on its command line, where any program could read them; the
 * file is removed as soon as the tool is done. Resolves to the exit code and what the tool said on its error output.
 */
async function runTool(tool: Tool, address: DatabaseAddress, args: string[], input?: string): Promise<{ code: number; stderr: string }> {
  const optionFile = join(tmpdir(), `echoes-mysql-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.cnf`)
  const options = [
    '[client]',
    `user=${optionValue(address.user)}`,
    `password=${optionValue(address.password)}`,
    `host=${optionValue(address.host)}`,
    `port=${address.port}`,
    ''
  ].join('\n')
  await writeFile(optionFile, options, { encoding: 'utf8', mode: 0o600 })
  try {
    return await new Promise((resolve) => {
      // The option file has to come first, before any other option.
      const child = spawn(tool.command, [...tool.prefixArgs, `--defaults-extra-file=${optionFile}`, ...args], {
        env: tool.env,
        windowsHide: true,
        stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe']
      })
      let stderr = ''
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_KEPT)
      })
      if (input) {
        const source = createReadStream(input)
        source.on('error', () => child.kill())
        source.pipe(child.stdin!)
      }
      child.once('error', (error) => resolve({ code: -1, stderr: error.message }))
      child.once('close', (code) => resolve({ code: code ?? -1, stderr: stderr.trim() }))
    })
  } finally {
    await rm(optionFile, { force: true })
  }
}

/**
 * Copies of the server's two databases, the accounts (login server) and the characters (game server), each read with the credentials its
 * server uses. Kept in the server's `backups` folder, one folder by date with a `.sql` file per database: the very files `mysqldump` writes,
 * which `mysql` reads back.
 */
export class BackupService {
  constructor(private readonly layout: () => ServerLayout | null) {}

  private folder(layout: ServerLayout): string {
    return join(layout.root, 'backups')
  }

  /** The folder backups are kept in, created if need be, so the interface can open it. */
  async folderPath(): Promise<string | null> {
    const layout = this.layout()
    if (!layout) {
      return null
    }
    await mkdir(this.folder(layout), { recursive: true })
    return this.folder(layout)
  }

  private async databases(layout: ServerLayout): Promise<DatabaseAddress[]> {
    const found = [await addressOf(layout.servers.login.dir), await addressOf(layout.servers.game.dir)].filter(
      (address): address is DatabaseAddress => address !== null
    )
    // Both servers on one database is copied once.
    return found.filter((address, index) => found.findIndex((other) => other.database === address.database) === index)
  }

  async list(): Promise<BackupSummary[]> {
    const layout = this.layout()
    if (!layout) {
      return []
    }
    let names: string[]
    try {
      names = await readdir(this.folder(layout))
    } catch {
      return []
    }
    const backups: BackupSummary[] = []
    for (const id of names.filter((name) => BACKUP_ID.test(name))) {
      try {
        const meta = JSON.parse(await readFile(join(this.folder(layout), id, META_FILE), 'utf8')) as BackupMeta
        backups.push({ id, createdAt: meta.createdAt, kind: meta.kind, databases: meta.databases.map(({ name, bytes }) => ({ name, bytes })) })
      } catch {
        // A folder without its description is not one the launcher made, or one it did not finish: not offered.
      }
    }
    return backups.sort((a, b) => b.id.localeCompare(a.id))
  }

  /**
   * Copies both databases. `--single-transaction` reads them as they stood at one instant, without locking out a server that runs; what a
   * running game server has not saved yet is not in them.
   */
  async create(kind: BackupSummary['kind'] = 'manual'): Promise<{ id: string } | Problem> {
    const layout = this.layout()
    if (!layout) {
      return { code: 'server-missing' }
    }
    const databases = await this.databases(layout)
    if (databases.length === 0) {
      return { code: 'backup-failed', detail: 'No database.url in the servers’ configuration' }
    }
    const { dump } = await mysqlTools()
    const versionOptions = await dumpOptions(dump)
    const now = new Date()
    let id = backupIdFor(now)
    for (let suffix = 2; await exists(join(this.folder(layout), id)); suffix++) {
      id = `${backupIdFor(now)}-${suffix}`
    }
    const dir = join(this.folder(layout), id)
    await mkdir(dir, { recursive: true })

    const meta: BackupMeta = { createdAt: now.toISOString(), kind, databases: [] }
    for (const address of databases) {
      const file = `${address.database}.sql`
      const result = await runTool(dump, address, [
        '--single-transaction',
        // Without it MySQL 8 and later ask for the PROCESS privilege, which the servers' own database user does not have.
        '--no-tablespaces',
        '--default-character-set=utf8mb4',
        ...versionOptions,
        `--result-file=${join(dir, file)}`,
        address.database
      ])
      if (result.code !== 0) {
        await rm(dir, { recursive: true, force: true })
        return { code: result.code === -1 ? 'mysql-tools-missing' : 'backup-failed', detail: result.stderr }
      }
      meta.databases.push({ name: address.database, file, bytes: (await stat(join(dir, file))).size })
    }
    // Written last: a folder without it is a backup that did not finish.
    await writeFile(join(dir, META_FILE), JSON.stringify(meta, null, 2), 'utf8')
    return { id }
  }

  /**
   * Puts a backup's databases back, after copying what is there now (kind `before-restore`), so a restore can itself be undone. The servers
   * must be stopped, which the caller checks: a running game server would write its characters back over the restored ones at its next save.
   */
  async restore(id: string): Promise<Problem | null> {
    const layout = this.layout()
    if (!layout) {
      return { code: 'server-missing' }
    }
    if (!BACKUP_ID.test(id)) {
      return { code: 'restore-failed', detail: id }
    }
    const dir = join(this.folder(layout), id)
    let meta: BackupMeta
    try {
      meta = JSON.parse(await readFile(join(dir, META_FILE), 'utf8')) as BackupMeta
    } catch {
      return { code: 'restore-failed', detail: `${id}: no ${META_FILE}` }
    }
    const addresses = await this.databases(layout)
    const targets = meta.databases.map((entry) => ({ entry, address: addresses.find((address) => address.database === entry.name) }))
    const unknown = targets.find((target) => !target.address)
    if (unknown) {
      return { code: 'restore-failed', detail: `${unknown.entry.name}: not a database of these servers` }
    }

    const safety = await this.create('before-restore')
    if ('code' in safety) {
      return safety
    }
    const { client } = await mysqlTools()
    for (const { entry, address } of targets) {
      const result = await runTool(client, address!, ['--default-character-set=utf8mb4', entry.name], join(dir, entry.file))
      if (result.code !== 0) {
        return {
          code: result.code === -1 ? 'mysql-tools-missing' : 'restore-failed',
          detail: `${result.stderr}\n(${safety.id} holds what was there before)`
        }
      }
    }
    return null
  }

  async remove(id: string): Promise<void> {
    const layout = this.layout()
    if (layout && BACKUP_ID.test(id)) {
      await rm(join(this.folder(layout), id), { recursive: true, force: true })
    }
  }
}

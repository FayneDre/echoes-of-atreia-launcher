import { execFile, spawn } from 'node:child_process'
import { open, readFile, stat } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import type { MysqlState, Problem } from '../../shared/types'
import type { DatabaseAddress } from '../accounts/accountStore'
import { isPortOpen } from '../system/network'
import { runTool, type Tool } from './mysqlTool'
import { ownMysqlOf } from './ownRuntimes'
import { waitFor } from './wait'

const START_TIMEOUT_MS = 60_000
// How much of the end of MySQL's error log is read for its last errors.
const LOG_TAIL_BYTES = 64 * 1024
const ERRORS_SHOWN = 3

// The exit code the elevated command reports when the person declined the Windows permission prompt.
const DECLINED = 1223

function runPowerShell(script: string, timeoutMs = 30_000): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: timeoutMs, windowsHide: true }, (error, stdout) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      resolve({ code, stdout })
    })
  })
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** A MySQL or MariaDB Windows service as the system lists it. */
interface ServiceInfo {
  name: string
  state: string
  exitCode: number
  pathName: string
}

/**
 * The MySQL or MariaDB Windows service, if one is installed; a running one first, when there are several (a leftover MySQL80 beside the one
 * in use must not be the one started).
 */
async function findService(): Promise<ServiceInfo | null> {
  // the tests' machine may have a MySQL service of its own: they can say there is none
  if (process.platform !== 'win32' || process.env['ECHOES_FAKE_NO_MYSQL_SERVICE']) {
    return null
  }
  const { stdout } = await runPowerShell(
    `Get-CimInstance Win32_Service | Where-Object { $_.Name -match 'mysql|mariadb' } | ` +
      `Sort-Object { $_.State -ne 'Running' }, Name | Select-Object -First 1 Name, State, ExitCode, PathName | ConvertTo-Json -Compress`
  )
  try {
    const found = JSON.parse(stdout) as { Name?: string; State?: string; ExitCode?: number; PathName?: string }
    if (!found.Name || !/^[\w.-]+$/.test(found.Name)) {
      return null
    }
    return { name: found.Name, state: found.State ?? '', exitCode: found.ExitCode ?? 0, pathName: found.PathName ?? '' }
  } catch {
    return null
  }
}

/** The program a service's command line starts: the quoted path, or the first word. */
export function executableOf(pathName: string): string | null {
  const executable = pathName.trim().match(/^"([^"]+)"|^(\S+)/)
  return executable?.[1] ?? executable?.[2] ?? null
}

/** The `--defaults-file` a service's command line gives its server, the MySQL installer's way of telling it its my.ini. */
export function defaultsFileOf(pathName: string): string | null {
  const option = pathName.match(/--defaults-file=(?:"([^"]+)"|(\S+))/)
  return option?.[1] ?? option?.[2] ?? null
}

/**
 * The folder of the MySQL programs (`mysqldump`, `mysql`): the one the service's own `mysqld.exe` is in. Null when there is no service or
 * its path cannot be read; the tools are then looked for on the PATH.
 */
export async function findMysqlBinDir(root?: string | null): Promise<string | null> {
  const own = ownMysqlOf(root)
  if (own) {
    return own.binDir
  }
  const service = await findService()
  const executable = service ? executableOf(service.pathName) : null
  return executable ? dirname(executable) : null
}

/**
 * The server's options of a MySQL option file (my.ini): the `[mysqld]` and `[server]` groups, whose names MySQL reads with `-` and `_` alike.
 * Values lose their quotes; a later line wins, as MySQL reads them.
 */
export function parseOptionFile(text: string): Map<string, string> {
  const options = new Map<string, string>()
  let inServer = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }
    const group = line.match(/^\[([^\]]+)\]/)
    if (group) {
      inServer = ['mysqld', 'server'].includes(group[1]!.trim().toLowerCase())
      continue
    }
    if (!inServer) {
      continue
    }
    const separator = line.indexOf('=')
    const key = (separator < 0 ? line : line.slice(0, separator)).trim().toLowerCase().replace(/-/g, '_')
    const value = separator < 0 ? '' : line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2')
    options.set(key, value)
  }
  return options
}

/** The `mysqld.exe` to run with an option file: its `basedir`, the folder the file is in (MySQL's own layout), or the service's. */
async function serverProgramFor(optionsFile: string): Promise<string | null> {
  const fake = process.env['ECHOES_FAKE_MYSQLD']
  if (fake) {
    return fake
  }
  const options = parseOptionFile(await readFile(optionsFile, 'utf8').catch(() => ''))
  const service = await findService()
  const serviceProgram = service ? executableOf(service.pathName) : null
  const basedir = options.get('basedir')
  const candidates = [basedir ? join(basedir, 'bin', 'mysqld.exe') : null, join(dirname(optionsFile), 'bin', 'mysqld.exe'), serviceProgram]
  for (const candidate of candidates) {
    if (candidate && (await exists(candidate))) {
      return candidate
    }
  }
  return null
}

/**
 * The last errors MySQL wrote in its error log, as the option file places it (`log-error`, relative to `datadir`, else `<host>.err` in
 * `datadir`). Best effort: a file the launcher may not read gives none.
 */
export async function lastErrors(optionsFile: string | null): Promise<string[]> {
  if (!optionsFile) {
    return []
  }
  try {
    const options = parseOptionFile(await readFile(optionsFile, 'utf8'))
    const dataDir = options.get('datadir')
    const logName = options.get('log_error') || `${hostname()}.err`
    const log = isAbsolute(logName) ? logName : dataDir ? join(dataDir, logName) : null
    if (!log) {
      return []
    }
    const file = await open(log, 'r')
    try {
      const { size } = await file.stat()
      const start = Math.max(0, size - LOG_TAIL_BYTES)
      const buffer = Buffer.alloc(size - start)
      await file.read(buffer, 0, buffer.length, start)
      return buffer
        .toString('utf8')
        .split(/\r?\n/)
        .filter((line) => line.includes('[ERROR]'))
        .slice(-ERRORS_SHOWN)
    } finally {
      await file.close()
    }
  } catch {
    return []
  }
}

/**
 * Starting or stopping a Windows service needs administrator rights, so Windows asks the person through its permission prompt. The
 * service name comes from the system's own list, and is checked to be a plain name before it reaches the command.
 */
async function controlService(name: string, action: 'start' | 'stop'): Promise<number> {
  const script =
    `try { $p = Start-Process -FilePath sc.exe -ArgumentList '${action}','${name}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; ` +
    `exit $p.ExitCode } catch { exit ${DECLINED} }`
  return (await runPowerShell(script, 120_000)).code
}

/** `mysqladmin`, beside the given server program, else beside the service's, else from the PATH; the end-to-end tests play it with a script. */
async function adminTool(serverProgram: string | null): Promise<Tool> {
  const fake = process.env['ECHOES_FAKE_MYSQL_TOOLS']
  if (fake) {
    return { command: process.execPath, prefixArgs: [join(fake, 'fake-mysqladmin.mjs')], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  }
  const folder = serverProgram ? dirname(serverProgram) : await findMysqlBinDir()
  const local = folder ? join(folder, 'mysqladmin.exe') : null
  return { command: local && (await exists(local)) ? local : 'mysqladmin', prefixArgs: [], env: process.env }
}

/** How the launcher reaches MySQL: where it answers, and, when the person chose to run it without the service, their option file. */
export interface MysqlSetup {
  address: { host: string; port: number } | null
  /** Set when MySQL is run as a program with this option file rather than through its Windows service. */
  optionsFile: string | null
  /** The game server's database account: what stops a MySQL that no running service holds. */
  credentials: () => Promise<DatabaseAddress | null>
}

/**
 * MySQL as the launcher sees it: up when its port answers. It is started and stopped either through its Windows service (which asks for the
 * administrator's permission), or as a program with the person's own option file, for a service that does not start (a my.ini the service
 * does not read): that one needs no permission, and is stopped by `mysqladmin shutdown`, which lets MySQL close its files. It is never killed.
 */
export class MysqlControl {
  private state: MysqlState = { status: 'unknown', serviceName: null, optionsFile: null, port: null }
  private setup: MysqlSetup = { address: null, optionsFile: null, credentials: async () => null }

  constructor(private readonly onChange: (state: MysqlState) => void) {}

  get current(): MysqlState {
    return this.state
  }

  private update(next: Partial<MysqlState>): void {
    this.state = { ...this.state, ...next }
    this.onChange(this.state)
  }

  private isUp(): Promise<boolean> {
    const address = this.setup.address
    return address ? isPortOpen(address.port, address.host) : Promise.resolve(false)
  }

  async refresh(setup: MysqlSetup): Promise<void> {
    this.setup = setup
    const { address, optionsFile } = setup
    if (!address) {
      this.update({ status: 'unknown', port: null, optionsFile, problem: undefined })
      return
    }
    const serviceName = (await findService())?.name ?? null
    const status = (await this.isUp()) ? 'ready' : serviceName || optionsFile ? 'stopped' : 'missing'
    this.update({ status, serviceName, optionsFile, port: address.port, problem: undefined })
  }

  async start(): Promise<Problem | null> {
    if (await this.isUp()) {
      this.update({ status: 'ready', problem: undefined })
      return null
    }
    return this.setup.optionsFile ? this.startProgram(this.setup.optionsFile) : this.startService()
  }

  private async startService(): Promise<Problem | null> {
    const service = await findService()
    if (!service) {
      return this.fail('missing', { code: 'mysql-missing' })
    }
    this.update({ status: 'starting', serviceName: service.name, problem: undefined })
    const code = await controlService(service.name, 'start')
    if (code === DECLINED) {
      return this.fail('stopped', { code: 'mysql-refused' })
    }
    if (await waitFor(() => this.isUp(), START_TIMEOUT_MS, 1000)) {
      this.update({ status: 'ready' })
      return null
    }
    // Windows took the request (sc answered 0) but MySQL is not there: most often the service stopped at once, on its own configuration.
    const after = await findService()
    if (after && after.state !== 'Running') {
      const optionsFile = defaultsFileOf(after.pathName)
      const detail = [`${after.name}: ${after.state} (${after.exitCode})`, optionsFile ?? '', ...(await lastErrors(optionsFile))]
      return this.fail('stopped', { code: 'mysql-service-stopped', detail: detail.filter(Boolean).join('\n') })
    }
    return this.fail('stopped', { code: 'mysql-timeout', detail: `sc start ${service.name}: ${code}` })
  }

  private async startProgram(optionsFile: string): Promise<Problem | null> {
    if (!(await exists(optionsFile))) {
      return this.fail('stopped', { code: 'mysql-options-missing', detail: optionsFile })
    }
    const program = await serverProgramFor(optionsFile)
    if (!program) {
      return this.fail('stopped', { code: 'mysql-program-missing', detail: optionsFile })
    }
    this.update({ status: 'starting', problem: undefined })
    // The port the servers connect to, whatever the file says, as the person's own script gives it.
    const args = [`--defaults-file=${optionsFile}`, `--port=${this.setup.address!.port}`]
    const fake = program === process.env['ECHOES_FAKE_MYSQLD']
    const child = spawn(fake ? process.execPath : program, fake ? [program, ...args] : args, {
      cwd: dirname(program),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: fake ? { ...process.env, ELECTRON_RUN_AS_NODE: '1' } : process.env
    })
    let exitCode: number | null = null
    let failure: string | null = null
    child.once('exit', (code) => (exitCode = code ?? -1))
    child.once('error', (error) => (failure = error.message))
    // MySQL runs on once the launcher closes: it is the database's own process, not one of the launcher's.
    child.unref()
    const ended = (): boolean => exitCode !== null || failure !== null
    if (await waitFor(() => this.isUp(), START_TIMEOUT_MS, 500, ended)) {
      this.update({ status: 'ready' })
      return null
    }
    const detail = [failure ?? (exitCode !== null ? `mysqld: ${exitCode}` : ''), ...(await lastErrors(optionsFile))]
    return this.fail('stopped', { code: ended() ? 'mysql-program-exited' : 'mysql-timeout', detail: detail.filter(Boolean).join('\n') })
  }

  async stop(): Promise<Problem | null> {
    // A running service is stopped as a service. A MySQL started any other way (the program mode, the person's own script) is asked to
    // shut down, as stopping the service would leave it running.
    const service = this.setup.optionsFile ? null : await findService()
    if (service && service.state === 'Running') {
      return this.stopService(service.name)
    }
    return this.shutdown()
  }

  private async stopService(name: string): Promise<Problem | null> {
    this.update({ status: 'stopping', problem: undefined })
    const code = await controlService(name, 'stop')
    if (code === DECLINED) {
      return this.fail('ready', { code: 'mysql-refused' })
    }
    if (!(await waitFor(async () => !(await this.isUp()), START_TIMEOUT_MS, 1000))) {
      return this.fail('ready', { code: 'mysql-timeout', detail: `sc stop ${name}: ${code}` })
    }
    this.update({ status: 'stopped' })
    return null
  }

  private async shutdown(): Promise<Problem | null> {
    const credentials = await this.setup.credentials()
    if (!credentials) {
      return this.fail('ready', { code: 'mysql-shutdown-failed', detail: 'database.url' })
    }
    this.update({ status: 'stopping', problem: undefined })
    const program = this.setup.optionsFile ? await serverProgramFor(this.setup.optionsFile) : null
    const tool = await adminTool(program === process.env['ECHOES_FAKE_MYSQLD'] ? null : program)
    const { code, stderr } = await runTool(tool, credentials, ['shutdown'])
    if (code !== 0) {
      // Most often the servers' account lacks the SHUTDOWN privilege: MySQL says so, and it is shown as it is.
      return this.fail('ready', { code: 'mysql-shutdown-failed', detail: stderr || `mysqladmin: ${code}` })
    }
    if (!(await waitFor(async () => !(await this.isUp()), START_TIMEOUT_MS, 500))) {
      return this.fail('ready', { code: 'mysql-timeout', detail: 'mysqladmin shutdown' })
    }
    this.update({ status: 'stopped' })
    return null
  }

  private fail(status: MysqlState['status'], problem: Problem): Problem {
    this.update({ status, problem })
    return problem
  }
}

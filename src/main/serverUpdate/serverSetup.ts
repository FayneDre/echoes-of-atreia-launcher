import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { readdir, statfs } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import type { Problem, ServerSetupState, ServerSetupStep } from '../../shared/types'
import type { Launcher } from '../launcher'
import { ServerFeed, type ServerRelease } from './feed'
import { CorruptError, ServerInstaller, runtimesOf } from './installer'
import { readInstallOrigin } from './manifest'
import { runServerScript, tail } from './powershell'

const SETUP_TIMEOUT_MS = 15 * 60 * 1000
/** The folder made inside the one chosen when that one already holds something. */
export const SERVER_FOLDER_NAME = 'echoes-server'
/** The staging folder a try works in, removed when it ends: a folder holding it is a try to take up. */
const STAGING = 'update-staging'
/** MySQL's own port is left to a MySQL the machine may already have. */
const FIRST_PORT = 3307
const LAST_PORT = 3399

/**
 * The room an install takes, from what its release names: the zips (bundle and runtimes) land once in the staging folder and about twice
 * their size unpacked, the maps once (gunzipped they are their size); half a gigabyte more for the database and the logs of a first start.
 */
export function neededBytes(release: ServerRelease): number {
  const zips = (release.manifest.bundle?.size ?? 0) + runtimesOf(release.manifest).reduce((sum, entry) => sum + entry.size, 0)
  const maps = Object.values(release.manifest.navmesh).reduce((sum, entry) => sum + entry.size, 0)
  return zips * 3 + maps + 512 * 1024 * 1024
}

/**
 * A folder the server may go into: one that does not exist, an empty one, or one holding a try that stopped before its end (only the launcher
 * makes `update-staging`, and the try that ends removes it): its files are compared by hash, so what is in place already stays.
 */
async function isFreeFolder(folder: string): Promise<boolean> {
  try {
    const names = await readdir(folder)
    return names.length === 0 || names.includes(STAGING)
  } catch {
    return true
  }
}

/** An install whose files are in place and whose database is not made yet: a try that failed at its last step, taken up there. */
async function awaitsDatabase(folder: string): Promise<boolean> {
  return (
    (await readInstallOrigin(folder)).source === 'release' &&
    existsSync(join(folder, 'mysql', 'bin', 'mysqld.exe')) &&
    !existsSync(join(folder, 'mysql', 'my.ini'))
  )
}

/**
 * Where the server goes: the folder chosen when it is empty, else a new folder inside it, and whether its files are in place already (an
 * earlier try stopped at the database); null when the folder holds something else.
 */
export async function serverFolderIn(chosen: string): Promise<{ folder: string; filesInPlace: boolean } | null> {
  for (const folder of [chosen, join(chosen, SERVER_FOLDER_NAME)]) {
    if (await awaitsDatabase(folder)) {
      return { folder, filesInPlace: true }
    }
    if (await isFreeFolder(folder)) {
      return { folder, filesInPlace: false }
    }
  }
  return null
}

/** The free space of the drive a folder is on, asked of its nearest folder that exists. */
async function freeBytes(folder: string): Promise<number | null> {
  for (let current = folder; ; current = dirname(current)) {
    try {
      const stats = await statfs(current)
      return stats.bavail * stats.bsize
    } catch {
      if (dirname(current) === current) {
        return null
      }
    }
  }
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

/** The first port from 3307 nothing listens on, for the install's own MySQL. */
export async function freeMysqlPort(): Promise<number | null> {
  for (let port = FIRST_PORT; port <= LAST_PORT; port++) {
    if (await portIsFree(port)) {
      return port
    }
  }
  return null
}

/**
 * An install from nothing (the server repository's empty-machine install plan): on a computer with the game client and nothing else, the
 * newest release this launcher follows is put into a folder of its own with the Java and the MySQL it carries, its database made by the
 * bundle's `setup-mysql.ps1` on a free port, and the folder becomes the launcher's server. Nothing is installed on the system. A try that
 * stops half-way keeps what it downloaded and checked; the next one fetches only the rest.
 */
export class ServerSetup extends EventEmitter<{ state: [ServerSetupState] }> {
  private state: ServerSetupState = { status: 'idle' }

  constructor(
    private readonly launcher: Launcher,
    private readonly beta: boolean,
    private readonly feed = new ServerFeed()
  ) {
    super()
  }

  get current(): ServerSetupState {
    return this.state
  }

  /** Installs into the folder chosen (or a new folder inside it); the problem when it could not. */
  async install(chosen: string): Promise<Problem | null> {
    if (this.state.status === 'running') {
      return { code: 'launcher-busy' }
    }
    const target = await serverFolderIn(chosen)
    if (!target) {
      return this.fail({ folder: chosen }, { code: 'setup-folder-not-empty', detail: join(chosen, SERVER_FOLDER_NAME) })
    }
    const { folder, filesInPlace } = target
    // MySQL reads its option file in the system's code page: a letter outside plain ASCII in the path would be read wrong
    if (/[^\x20-\x7E]/.test(folder)) {
      return this.fail({ folder }, { code: 'setup-folder-path', detail: folder })
    }
    let base: Omit<ServerSetupState, 'status'> = { folder }
    const step = (current: ServerSetupStep) => (percent?: number): void => this.set({ ...base, status: 'running', step: current, percent })
    const problem = await this.launcher.installServerInto(folder, async () => {
      if (!filesInPlace) {
        const files = await this.installFiles(folder, (version) => (base = { folder, version }), step)
        if (files) {
          return files
        }
      }
      step('database')()
      const port = await freeMysqlPort()
      if (port === null) {
        return { code: 'setup-no-port', detail: `${FIRST_PORT}-${LAST_PORT}` }
      }
      // the bundle's own script: the data folder, the accounts, the three databases and the servers' configuration; MySQL is left running
      const setup = await runServerScript(join(folder, 'tools', 'setup-mysql.ps1'), ['-ServerRoot', folder, '-Port', String(port)], SETUP_TIMEOUT_MS)
      return setup.code === 0 ? null : { code: 'setup-database-failed', detail: tail(setup.output) }
    })
    if (problem) {
      return this.fail(base, problem)
    }
    this.set({ status: 'idle' })
    return null
  }

  /** The release looked for, the room checked, then the runtimes, the bundle and the maps downloaded, checked and put in place. */
  private async installFiles(
    folder: string,
    found: (version: string) => void,
    step: (current: ServerSetupStep) => (percent?: number) => void
  ): Promise<Problem | null> {
    step('release')()
    let release: ServerRelease | null
    try {
      release = await this.feed.newest(this.beta)
    } catch (error) {
      return { code: 'update-feed-failed', detail: (error as Error).message }
    }
    if (!release || !release.manifest.runtimes?.java || !release.manifest.runtimes?.mysql) {
      return { code: 'setup-no-release' }
    }
    found(release.tag)
    const needed = neededBytes(release)
    const free = await freeBytes(folder)
    if (free !== null && free < needed) {
      return { code: 'setup-disk-space', detail: `${Math.ceil(needed / 1024 ** 3)} GB` }
    }
    const installer = new ServerInstaller(folder, this.feed)
    try {
      step('runtimes')(0)
      await installer.fetchRuntimes(release, step('runtimes'))
      step('download')(0)
      await installer.fetchBundle(release, step('download'))
      const plan = await installer.plan(release, null)
      step('navmesh')(0)
      await installer.fetchNavmesh(release, plan, step('navmesh'))
      step('files')()
      await installer.installFresh(release, plan)
    } catch (error) {
      return { code: error instanceof CorruptError ? 'update-corrupt' : 'update-download-failed', detail: (error as Error).message }
    }
    return null
  }

  private fail(base: Omit<ServerSetupState, 'status'>, problem: Problem): Problem {
    this.set({ ...base, status: 'failed', problem })
    return problem
  }

  private set(state: ServerSetupState): void {
    this.state = state
    this.emit('state', state)
  }
}

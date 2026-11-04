import { EventEmitter } from 'node:events'
import {
  REQUIRED_JAVA,
  SERVER_IDS,
  type FolderKind,
  type InstallState,
  type LauncherState,
  type LogBatch,
  type Problem,
  type ServerId,
  type ServerState
} from '../shared/types'
import { launchClient } from './client'
import { findClientNear, isClientFolder, readServerLayout, type ServerLayout } from './server/installation'
import { MysqlControl } from './server/mysql'
import { ServerProcess } from './server/serverProcess'
import { loadSettings, saveSettings, type Settings } from './settings'
import { javaCommand, javaMajorVersion } from './system/java'

/**
 * The whole stack and what the interface sees of it. Starts in dependency order (MySQL, chat, login, game: the game server connects to the
 * other two while it starts) and stops in the reverse one, each step waiting for the one before.
 */
export class Launcher extends EventEmitter<{ state: [LauncherState]; lines: [LogBatch] }> {
  private settings: Settings = {}
  private layout: ServerLayout | null = null
  private servers: Partial<Record<ServerId, ServerProcess>> = {}
  private readonly mysql = new MysqlControl(() => this.publish())
  private install: InstallState = { serverRoot: null, serverFound: false, clientRoot: null, clientFound: false, javaVersion: null }
  private busy = false
  private quitRequested = false
  private problem: Problem | undefined

  getState(): LauncherState {
    const servers = Object.fromEntries(
      SERVER_IDS.map((id) => [id, this.servers[id]?.current ?? ({ id, status: 'stopped', external: false, port: null } satisfies ServerState)])
    ) as Record<ServerId, ServerState>
    return {
      install: this.install,
      mysql: this.mysql.current,
      servers,
      busy: this.busy,
      quitRequested: this.quitRequested,
      problem: this.problem
    }
  }

  getLogs(id: ServerId): string[] {
    return this.servers[id]?.logLines ?? []
  }

  get anyRunning(): boolean {
    return SERVER_IDS.some((id) => this.servers[id]?.hasProcess)
  }

  private publish(): void {
    this.emit('state', this.getState())
  }

  async initialize(): Promise<void> {
    this.settings = await loadSettings()
    await this.detect()
  }

  /** Finds the server, the client and Java, then takes over whatever servers are already running. */
  async detect(): Promise<void> {
    const serverRoot = this.settings.serverRoot || process.env['AION_SERVER_HOME'] || null
    this.layout = serverRoot ? await readServerLayout(serverRoot) : null
    const clientRoot = this.settings.clientRoot ?? (serverRoot ? await findClientNear(serverRoot) : null)
    this.install = {
      serverRoot,
      serverFound: this.layout !== null,
      clientRoot,
      clientFound: clientRoot ? await isClientFolder(clientRoot) : false,
      javaVersion: await javaMajorVersion()
    }

    for (const server of Object.values(this.servers)) {
      server.dispose()
    }
    this.servers = {}
    if (this.layout) {
      for (const id of SERVER_IDS) {
        const server = new ServerProcess(this.layout.servers[id])
        server.on('state', () => this.publish())
        server.on('lines', (lines) => this.emit('lines', { server: id, lines }))
        this.servers[id] = server
      }
    }
    this.problem = undefined
    this.publish()

    await this.mysql.refresh(this.layout?.mysql ?? null)
    for (const id of SERVER_IDS) {
      await this.servers[id]?.adopt()
    }
  }

  async chooseFolder(kind: FolderKind, folder: string): Promise<void> {
    if (this.anyRunning || this.busy) {
      return
    }
    this.settings = kind === 'server' ? { ...this.settings, serverRoot: folder } : { ...this.settings, clientRoot: folder }
    await saveSettings(this.settings)
    await this.detect()
  }

  private async exclusive(work: () => Promise<boolean>): Promise<boolean> {
    if (this.busy) {
      return false
    }
    this.busy = true
    this.problem = undefined
    this.publish()
    try {
      return await work()
    } finally {
      this.busy = false
      this.publish()
    }
  }

  private fail(problem: Problem): false {
    this.problem = problem
    return false
  }

  startAll(): Promise<boolean> {
    return this.exclusive(async () => {
      if (!this.layout) {
        return this.fail({ code: 'server-missing' })
      }
      const java = await javaMajorVersion()
      this.install = { ...this.install, javaVersion: java }
      if (java === null) {
        return this.fail({ code: 'java-missing' })
      }
      if (java < REQUIRED_JAVA) {
        return this.fail({ code: 'java-too-old', detail: String(java) })
      }
      if (this.mysql.current.status !== 'ready') {
        const problem = await this.mysql.start()
        if (problem) {
          return this.fail(problem)
        }
      }
      for (const id of SERVER_IDS) {
        if (!(await this.servers[id]!.start(javaCommand()))) {
          return false
        }
      }
      return true
    })
  }

  /** Stops the game server first: it saves the players and needs the login server and the database until it is done. */
  stopAll(): Promise<boolean> {
    return this.exclusive(async () => {
      for (const id of [...SERVER_IDS].reverse()) {
        // A server that failed has nothing left to stop, and stopping it clears the failure.
        const server = this.servers[id]
        if (server && server.current.status !== 'stopped' && !(await server.stop())) {
          return false
        }
      }
      return true
    })
  }

  forceStop(id: ServerId): Promise<boolean> {
    return this.servers[id]?.forceStop() ?? Promise.resolve(true)
  }

  startMysql(): Promise<boolean> {
    return this.exclusive(async () => {
      const problem = await this.mysql.start()
      return problem ? this.fail(problem) : true
    })
  }

  stopMysql(): Promise<boolean> {
    return this.exclusive(async () => {
      if (this.servers.game?.hasProcess) {
        return this.fail({ code: 'mysql-in-use' })
      }
      const problem = await this.mysql.stop()
      return problem ? this.fail(problem) : true
    })
  }

  async play(): Promise<boolean> {
    if (!this.install.clientFound || !this.install.clientRoot || !this.layout) {
      this.problem = { code: 'client-missing' }
      this.publish()
      return false
    }
    const problem = await launchClient(this.install.clientRoot, this.layout.loginClientPort)
    this.problem = problem ?? undefined
    this.publish()
    return problem === null
  }

  setQuitRequested(requested: boolean): void {
    this.quitRequested = requested
    this.publish()
  }

  dispose(): void {
    for (const server of Object.values(this.servers)) {
      server.dispose()
    }
  }
}

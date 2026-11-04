import { EventEmitter } from 'node:events'
import {
  REQUIRED_JAVA,
  SERVER_IDS,
  type Activity,
  type FolderKind,
  type InstallState,
  type LauncherState,
  type LogBatch,
  type Problem,
  type ServerId,
  type ServerSettings,
  type ServerState
} from '../shared/types'
import { launchClient } from './client'
import { findClientNear, isClientFolder, readServerLayout, type ServerLayout } from './server/installation'
import { MysqlControl } from './server/mysql'
import { ServerProcess } from './server/serverProcess'
import { readServerSettings, writeServerSettings } from './server/serverSettings'
import type { SettingsStore } from './settings'
import { javaCommand, javaMajorVersion } from './system/java'

/**
 * The whole stack and what the interface sees of it. Starts in dependency order (MySQL, chat, login, game: the game server connects to the
 * other two while it starts) and stops in the reverse one, each step waiting for the one before. A stop may interrupt a start: the game
 * server takes minutes to load, and the person must not have to wait for it to be ready to change their mind.
 */
export class Launcher extends EventEmitter<{ state: [LauncherState]; lines: [LogBatch] }> {
  private layout: ServerLayout | null = null
  private servers: Partial<Record<ServerId, ServerProcess>> = {}
  private readonly mysql = new MysqlControl(() => this.publish())
  private install: InstallState = { serverRoot: null, serverFound: false, clientRoot: null, clientFound: false, javaVersion: null }
  private activity: Activity = 'detecting'
  private stopRequested = false
  private quitRequested = false
  private restartNeeded = false
  private problem: Problem | undefined

  constructor(private readonly settings: SettingsStore) {
    super()
  }

  /** The installation the servers run from, or null when none was found. */
  get currentLayout(): ServerLayout | null {
    return this.layout
  }

  getState(): LauncherState {
    const servers = Object.fromEntries(
      SERVER_IDS.map((id) => [id, this.servers[id]?.current ?? ({ id, status: 'stopped', external: false, port: null } satisfies ServerState)])
    ) as Record<ServerId, ServerState>
    return {
      install: this.install,
      mysql: this.mysql.current,
      servers,
      activity: this.activity,
      quitRequested: this.quitRequested,
      restartNeeded: this.restartNeeded,
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

  /** Runs one activity at a time. Ends it only if it is still the current one: a stop may have taken over a start. */
  private async run(activity: Exclude<Activity, 'idle'>, work: () => Promise<boolean>, force = false): Promise<boolean> {
    if (this.activity !== 'idle' && !force) {
      return false
    }
    this.activity = activity
    this.problem = undefined
    this.publish()
    try {
      return await work()
    } finally {
      if (this.activity === activity) {
        this.activity = 'idle'
      }
      this.publish()
    }
  }

  private fail(problem: Problem): false {
    this.problem = problem
    return false
  }

  initialize(): Promise<boolean> {
    return this.run(
      'detecting',
      async () => {
        await this.detect()
        return true
      },
      true
    )
  }

  /** Finds the server, the client and Java, then takes over whatever servers are already running. */
  private async detect(): Promise<void> {
    const saved = this.settings.current
    const serverRoot = saved.serverRoot || process.env['AION_SERVER_HOME'] || null
    this.layout = serverRoot ? await readServerLayout(serverRoot) : null
    const clientRoot = saved.clientRoot || (serverRoot ? await findClientNear(serverRoot) : null)
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
        server.on('state', (state) => {
          // A game server that stops, or starts again, reads the settings anew.
          if (id === 'game' && (state.status === 'stopped' || state.status === 'starting')) {
            this.restartNeeded = false
          }
          this.publish()
        })
        server.on('lines', (lines) => this.emit('lines', { server: id, lines }))
        this.servers[id] = server
      }
    }
    this.publish()

    await this.mysql.refresh(this.layout?.mysql ?? null)
    for (const id of SERVER_IDS) {
      await this.servers[id]?.adopt()
    }
  }

  chooseFolder(kind: FolderKind, folder: string): Promise<boolean> {
    if (this.anyRunning) {
      return Promise.resolve(false)
    }
    return this.run('detecting', async () => {
      await this.settings.update((settings) =>
        kind === 'server' ? { ...settings, serverRoot: folder } : { ...settings, clientRoot: folder }
      )
      await this.detect()
      return true
    })
  }

  startAll(): Promise<boolean> {
    return this.run('starting', async () => {
      this.stopRequested = false
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
        if (this.stopRequested || !(await this.servers[id]!.start(javaCommand()))) {
          return false
        }
      }
      return true
    })
  }

  /**
   * Stops the game server first: it saves the players and needs the login server and the database until it is done. Interrupts a start
   * under way: each server gives up its start at its next step.
   */
  stopAll(): Promise<boolean> {
    if (this.activity === 'stopping') {
      return Promise.resolve(false)
    }
    this.stopRequested = true
    return this.run(
      'stopping',
      async () => {
        for (const id of [...SERVER_IDS].reverse()) {
          // A server that failed has nothing left to stop, and stopping it clears the failure.
          const server = this.servers[id]
          if (server && server.current.status !== 'stopped' && !(await server.stop())) {
            return false
          }
        }
        return true
      },
      this.activity === 'starting'
    )
  }

  /**
   * Runs a backup or a restore as the launcher's activity, so it never crosses a start or a stop; a restore also needs every server stopped,
   * or a running game server would write its characters back over the restored ones.
   */
  async withActivity(activity: 'backup' | 'restore', work: () => Promise<Problem | null>): Promise<Problem | null> {
    if (activity === 'restore' && this.anyRunning) {
      return { code: 'servers-running' }
    }
    let result: Problem | null = { code: 'launcher-busy' }
    await this.run(activity, async () => {
      result = await work()
      return result === null
    })
    return result
  }

  forceStop(id: ServerId): Promise<boolean> {
    return this.servers[id]?.forceStop() ?? Promise.resolve(true)
  }

  startMysql(): Promise<boolean> {
    return this.run('mysql', async () => {
      const problem = await this.mysql.start()
      return problem ? this.fail(problem) : true
    })
  }

  stopMysql(): Promise<boolean> {
    return this.run('mysql', async () => {
      // The game server saves the characters into it, and the login server reads the accounts from it.
      if (this.anyRunning) {
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

  /** The game server's settings as the launcher offers them, or null without a server installation. */
  getServerSettings(): Promise<ServerSettings | null> {
    return this.layout ? readServerSettings(this.layout.servers.game.dir) : Promise.resolve(null)
  }

  /** Saves the values; a game server that runs reads them at its next start, and the interface says so. */
  async saveServerSettings(values: Record<string, number>): Promise<boolean> {
    if (!this.layout) {
      return false
    }
    await writeServerSettings(this.layout.servers.game.dir, values)
    if (this.servers.game?.hasProcess) {
      this.restartNeeded = true
      this.publish()
    }
    return true
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

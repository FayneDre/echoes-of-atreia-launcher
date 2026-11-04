import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Problem, ProblemCode, ServerState } from '../../shared/types'
import type { JavaCommand } from '../system/java'
import { isPortOpen } from '../system/network'
import { findJavaProcess, isProcessAlive, killProcess } from '../system/processes'
import type { ServerDefinition } from './installation'
import { LogTail } from './logTail'
import { waitFor } from './wait'

const PORT_TIMEOUT_MS = 120_000
// The game server registers with the login server once its whole startup is over, bots included: two to five minutes.
const REGISTER_TIMEOUT_MS = 600_000
// Saving every bot took up to 510 s; the shutdown delay comes on top when players are online.
const STOP_TIMEOUT_MS = 900_000
// The server deletes the request within half a second: still there after this, nothing is reading it.
const REQUEST_UNANSWERED_MS = 10_000
const KILL_TIMEOUT_MS = 15_000
const LOG_LINES_KEPT = 2000
const REGISTERED_LINE = 'Connected to login server'
// What the JVM writes before its logging starts (a wrong Java version, a missing class) goes here, the console being hidden.
const STDERR_FILE = 'launcher-stderr.log'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function lastLines(file: string, count: number): Promise<string[]> {
  try {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/).filter((line) => line.trim())
    return lines.slice(-count)
  } catch {
    return []
  }
}

/**
 * One server of the stack: started as a bare JVM with the arguments of its start.bat, followed through its console log, and stopped the
 * way that keeps its data. The game server is never killed while it can stop by itself: it saves the players from its shutdown hook, which
 * a killed process never runs. It is asked through the `shutdown.request` file it watches instead.
 */
export class ServerProcess extends EventEmitter<{ state: [ServerState]; lines: [string[]] }> {
  private state: ServerState
  private child: ChildProcess | null = null
  private pid: number | null = null
  private exited = false
  private exitCode: number | null = null
  private spawnError: string | null = null
  private registered = false
  private monitor: NodeJS.Timeout | null = null
  private readonly lines: string[] = []
  private readonly tail: LogTail

  constructor(private readonly definition: ServerDefinition) {
    super()
    this.state = { id: definition.id, status: 'stopped', external: false, port: definition.port }
    this.tail = new LogTail(join(definition.dir, 'log', 'server_console.log'))
    this.tail.on('lines', (lines) => this.onLines(lines))
  }

  get current(): ServerState {
    return this.state
  }

  get logLines(): string[] {
    return [...this.lines]
  }

  /** Whether there is a process to stop, whatever the status says (a start that timed out leaves its JVM running). */
  get hasProcess(): boolean {
    if (this.child) {
      return !this.exited
    }
    return this.state.external
  }

  private get waitsForRegistration(): boolean {
    return this.definition.id === 'game'
  }

  private update(next: Partial<ServerState>): void {
    this.state = { ...this.state, ...next }
    this.emit('state', this.state)
  }

  private onLines(lines: string[]): void {
    const kept = lines.slice(-LOG_LINES_KEPT)
    if (this.waitsForRegistration && kept.some((line) => line.includes(REGISTERED_LINE))) {
      this.registered = true
    }
    this.lines.push(...kept)
    this.lines.splice(0, Math.max(0, this.lines.length - LOG_LINES_KEPT))
    this.emit('lines', kept)
  }

  private async isGone(): Promise<boolean> {
    if (this.child) {
      return this.exited
    }
    if (this.pid !== null) {
      return !isProcessAlive(this.pid)
    }
    return !(await isPortOpen(this.definition.port))
  }

  /** Takes over a server that is already running: started by a script, or left running when the launcher was last closed. */
  async adopt(): Promise<void> {
    if (this.hasProcess || !(await isPortOpen(this.definition.port))) {
      return
    }
    this.pid = await findJavaProcess(this.definition.mainClass)
    this.registered = false
    this.update({ status: this.waitsForRegistration ? 'registering' : 'ready', external: true, problem: undefined })
    // The whole file: a server moves its old log aside when it starts, so what is there is this run's.
    await this.tail.start(false)
    this.watchExternal()
    if (this.waitsForRegistration) {
      void this.awaitRegistration()
    }
  }

  private async awaitRegistration(): Promise<boolean> {
    const registered = await waitFor(
      () => this.registered,
      REGISTER_TIMEOUT_MS,
      1000,
      () => this.exited || this.state.status === 'stopped'
    )
    if (registered && this.state.status === 'registering') {
      this.update({ status: 'ready' })
    }
    return registered
  }

  // A server the launcher did not start has no exit event: it is checked on. By process id when known, else by its port, sparingly.
  private watchExternal(): void {
    this.stopWatching()
    const interval = this.pid !== null ? 3000 : 10_000
    this.monitor = setInterval(() => {
      void this.isGone().then((gone) => {
        if (gone && this.state.status !== 'stopping') {
          this.finishStopped()
        }
      })
    }, interval)
  }

  private stopWatching(): void {
    if (this.monitor) {
      clearInterval(this.monitor)
      this.monitor = null
    }
  }

  /** Starts the server and resolves once it is ready for what comes next, or to false with the reason in the state. */
  async start(java: JavaCommand): Promise<boolean> {
    if (this.hasProcess) {
      // A start that timed out leaves its JVM behind: it has to be stopped before it is started again.
      if (this.state.status === 'failed') {
        return false
      }
      return this.state.status === 'ready' || this.awaitRegistration()
    }
    this.registered = false
    this.exited = false
    this.exitCode = null
    this.spawnError = null
    this.update({ status: 'starting', external: false, problem: undefined })
    await this.tail.start(true)

    const logDir = join(this.definition.dir, 'log')
    mkdirSync(logDir, { recursive: true })
    const stderr = openSync(join(logDir, STDERR_FILE), 'w')
    try {
      // Detached, so closing the launcher can leave the servers running; hidden, so no console window shows (and none can be clicked
      // into: a console in selection mode stops the whole server).
      const child = spawn(java.command, [...java.prefixArgs, ...this.definition.javaArgs], {
        cwd: this.definition.dir,
        env: java.env,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', 'ignore', stderr]
      })
      child.once('error', (error) => {
        this.spawnError = error.message
        this.exited = true
      })
      child.once('exit', (code) => this.onExit(code))
      child.unref()
      this.child = child
      this.pid = child.pid ?? null
    } finally {
      closeSync(stderr)
    }

    const listening = await waitFor(() => isPortOpen(this.definition.port), PORT_TIMEOUT_MS, 500, () => this.exited)
    if (!listening) {
      return this.failStart(this.exited ? 'exited' : 'port-timeout')
    }
    if (this.waitsForRegistration) {
      this.update({ status: 'registering' })
      if (!(await this.awaitRegistration())) {
        return this.failStart(this.exited ? 'exited' : 'register-timeout')
      }
    }
    this.update({ status: 'ready' })
    return true
  }

  private async failStart(code: ProblemCode): Promise<false> {
    this.update({ status: 'failed', problem: { code, detail: await this.failureDetail() } })
    return false
  }

  private async failureDetail(): Promise<string> {
    const parts: string[] = []
    if (this.spawnError) {
      parts.push(this.spawnError)
    }
    if (this.exitCode !== null) {
      parts.push(`exit code ${this.exitCode}`)
    }
    parts.push(...(await lastLines(join(this.definition.dir, 'log', STDERR_FILE), 15)))
    parts.push(...this.lines.slice(-10))
    return parts.join('\n')
  }

  private onExit(code: number | null): void {
    this.exited = true
    this.exitCode = code
    if (this.state.status === 'stopping') {
      return
    }
    // A start under way sees the exit through its own wait and reports it; a server that was up and stopped by itself is reported here.
    if (this.state.status === 'ready') {
      void this.failureDetail().then((detail) => {
        this.tail.stop()
        this.update({ status: 'failed', problem: { code: 'exited', detail } })
      })
    }
  }

  /** Stops the server and resolves to whether it is gone; when it is not, the state says why and forceStop is the way left. */
  async stop(): Promise<boolean> {
    if (!this.hasProcess) {
      this.finishStopped()
      return true
    }
    this.update({ status: 'stopping', problem: undefined })
    if (this.definition.id === 'game') {
      const request = join(this.definition.dir, 'shutdown.request')
      await writeFile(request, '')
      const answered = await waitFor(async () => !(await exists(request)) || (await this.isGone()), REQUEST_UNANSWERED_MS)
      if (!answered) {
        // A server built before the watcher: the file would otherwise stop the next start at once.
        await rm(request, { force: true })
        return this.failStop({ code: 'stop-unanswered' })
      }
      if (!(await waitFor(() => this.isGone(), STOP_TIMEOUT_MS))) {
        return this.failStop({ code: 'stop-timeout' })
      }
    } else {
      // The chat and login servers keep nothing that a shutdown would save.
      if (this.pid !== null) {
        killProcess(this.pid)
      }
      if (!(await waitFor(() => this.isGone(), KILL_TIMEOUT_MS))) {
        return this.failStop({ code: 'stop-timeout' })
      }
    }
    this.finishStopped()
    return true
  }

  private failStop(problem: Problem): false {
    this.update({ problem })
    return false
  }

  /** Kills the process. For the game server this loses whatever it had not saved yet: the interface asks before calling it. */
  async forceStop(): Promise<boolean> {
    if (this.pid === null) {
      return !this.hasProcess
    }
    killProcess(this.pid)
    const gone = await waitFor(() => this.isGone(), KILL_TIMEOUT_MS)
    if (gone) {
      this.finishStopped()
    }
    return gone
  }

  private finishStopped(): void {
    this.tail.stop()
    this.stopWatching()
    this.child = null
    this.pid = null
    this.update({ status: 'stopped', external: false, problem: undefined })
  }

  dispose(): void {
    this.tail.stop()
    this.stopWatching()
    this.removeAllListeners()
  }
}

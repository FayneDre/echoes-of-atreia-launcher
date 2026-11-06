import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Problem, ProblemCode, ServerState } from '../../shared/types'
import type { JavaCommand } from '../system/java'
import { isPortOpen } from '../system/network'
import { findJavaProcesses, isProcessAlive, killProcess } from '../system/processes'
import type { ServerDefinition } from './installation'
import { fileMentions, LogTail } from './logTail'
import { waitFor } from './wait'

const PORT_TIMEOUT_MS = 120_000
// The game server registers with the login server once its whole startup is over, bots included: two to five minutes.
const REGISTER_TIMEOUT_MS = 600_000
// Saving every bot took up to 510 s; the shutdown delay comes on top when players are online.
const STOP_TIMEOUT_MS = 900_000
// The server deletes the request within half a second: still there after this, nothing is reading it.
const REQUEST_UNANSWERED_MS = 10_000
const KILL_TIMEOUT_MS = 15_000
// Whether a server is gone is asked of its process when the launcher knows it, cheaply and often; otherwise of its port, rarely, since every
// answer is a connection the server sees and the game server rejects a source that opens 20 in 10 seconds.
const PROCESS_POLL_MS = 500
const PORT_POLL_MS = 5000
const LOG_LINES_KEPT = 2000
const REGISTERED_LINE = 'Connected to login server'
// A startup that throws ends the main thread with this line, and the JVM stays up on the threads it started: it never exits by itself.
const FATAL_LINE = 'terminated abnormally'
const ERROR_LINE = / ERROR /
const CONSOLE_LOG = 'server_console.log'
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
 * way that keeps its data. The game server is never killed once it can stop by itself: it saves the players from its shutdown hook, which a
 * killed process never runs. It is asked through the `shutdown.request` file it watches instead.
 */
export class ServerProcess extends EventEmitter<{ state: [ServerState]; lines: [string[]] }> {
  private state: ServerState
  private child: ChildProcess | null = null
  private pid: number | null = null
  private exited = false
  private exitCode: number | null = null
  private spawnError: string | null = null
  private registered = false
  // The game server opens its port, then installs its shutdown hook and starts watching for the request, in the same breath.
  private portOpened = false
  // A stop asked while the start is still under way: the start gives up at its next step instead of reporting a failure.
  private stopRequested = false
  /** The start's main thread died (FATAL_LINE): the start gives up at once instead of waiting minutes for a port. */
  private crashed = false
  /** The error lines this start logged, the first of which says why it crashed. */
  private startErrors: string[] = []
  private monitor: NodeJS.Timeout | null = null
  private readonly lines: string[] = []
  private readonly tail: LogTail
  private readonly logDir: string

  constructor(private readonly definition: ServerDefinition) {
    super()
    this.state = { id: definition.id, status: 'stopped', external: false, port: definition.port }
    this.logDir = join(definition.dir, 'log')
    this.tail = new LogTail(join(this.logDir, CONSOLE_LOG))
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

  private get knowsProcess(): boolean {
    return this.child !== null || this.pid !== null
  }

  /** The server's process id when the launcher knows it, for what the home page shows of it. */
  get processId(): number | null {
    return this.hasProcess ? (this.child?.pid ?? this.pid) : null
  }

  private update(next: Partial<ServerState>): void {
    const state = { ...this.state, ...next }
    if (state.status !== 'ready') {
      delete state.readyAt
    }
    this.state = state
    this.emit('state', this.state)
  }

  private onLines(lines: string[]): void {
    const kept = lines.slice(-LOG_LINES_KEPT)
    if (this.waitsForRegistration && kept.some((line) => line.includes(REGISTERED_LINE))) {
      this.registered = true
    }
    if (this.state.status === 'starting' || this.state.status === 'registering') {
      this.startErrors.push(...kept.filter((line) => ERROR_LINE.test(line) || line.startsWith('Caused by:')).slice(0, 50 - this.startErrors.length))
      if (kept.some((line) => line.includes(FATAL_LINE))) {
        this.crashed = true
      }
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

  private waitUntilGone(timeoutMs: number): Promise<boolean> {
    return waitFor(() => this.isGone(), timeoutMs, this.knowsProcess ? PROCESS_POLL_MS : PORT_POLL_MS)
  }

  /**
   * Whether this run of the server has registered with the login server, read from its logs: the current console log and the ones it rolled
   * over at 100 MB. A server moves its old logs aside when it starts, so all of them belong to this run.
   */
  private async registeredInLogs(): Promise<boolean> {
    let names: string[]
    try {
      names = await readdir(this.logDir)
    } catch {
      return false
    }
    const consoleLogs = names.filter((name) => name === CONSOLE_LOG || /^server_console\.\d+\.log$/.test(name))
    for (const name of consoleLogs) {
      if (await fileMentions(join(this.logDir, name), REGISTERED_LINE)) {
        return true
      }
    }
    return false
  }

  /** Takes over a server that is already running: started by a script, or left running when the launcher was last closed. */
  async adopt(): Promise<void> {
    if (this.hasProcess || !(await isPortOpen(this.definition.port))) {
      return
    }
    const candidates = await findJavaProcesses(this.definition.mainClass)
    // Two servers of this kind run (another install, one started elsewhere): which is this install's cannot be told, so none is taken for
    // it. The game server still stops through its request, in its own folder; a chat or login server is not killed on a guess.
    this.pid = candidates.length === 1 ? candidates[0]! : null
    this.portOpened = true
    this.stopRequested = false
    this.registered = this.waitsForRegistration && (await this.registeredInLogs())
    const status = this.waitsForRegistration && !this.registered ? 'registering' : 'ready'
    this.update({ status, external: true, problem: undefined })
    await this.tail.start('recent')
    this.watchExternal()
    if (status === 'registering') {
      void this.awaitRegistration()
    }
  }

  private async awaitRegistration(): Promise<boolean> {
    const registered = await waitFor(
      () => this.registered,
      REGISTER_TIMEOUT_MS,
      1000,
      () => this.exited || this.crashed || this.stopRequested || this.state.status === 'stopped'
    )
    if (registered && this.state.status === 'registering') {
      this.update({ status: 'ready', readyAt: this.state.external ? undefined : Date.now() })
    }
    return registered
  }

  // A server the launcher did not start has no exit event: it is checked on.
  private watchExternal(): void {
    this.stopWatching()
    this.monitor = setInterval(
      () => {
        void this.isGone().then((gone) => {
          if (gone && this.state.status !== 'stopping') {
            this.finishStopped()
          }
        })
      },
      this.pid !== null ? 3000 : 10_000
    )
  }

  private stopWatching(): void {
    if (this.monitor) {
      clearInterval(this.monitor)
      this.monitor = null
    }
  }

  /**
   * Starts the server and resolves once it is ready for what comes next. Resolves to false with the reason in the state, or quietly when a
   * stop was asked meanwhile.
   */
  async start(java: JavaCommand): Promise<boolean> {
    if (this.hasProcess) {
      // A start that timed out leaves its JVM behind: it has to be stopped before it is started again.
      if (this.state.status === 'failed') {
        return false
      }
      return this.state.status === 'ready' || this.awaitRegistration()
    }
    this.registered = false
    this.portOpened = false
    this.stopRequested = false
    this.crashed = false
    this.startErrors = []
    this.exited = false
    this.exitCode = null
    this.spawnError = null
    this.update({ status: 'starting', external: false, problem: undefined })
    await this.tail.start('end')
    if (this.stopRequested) {
      return false
    }

    mkdirSync(this.logDir, { recursive: true })
    const stderr = openSync(join(this.logDir, STDERR_FILE), 'w')
    try {
      // Detached, so closing the launcher can leave the servers running, and without a console: none to click into (a console in selection
      // mode stops the whole server), none to close by mistake.
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

    const listening = await waitFor(
      () => isPortOpen(this.definition.port),
      PORT_TIMEOUT_MS,
      500,
      () => this.exited || this.crashed || this.stopRequested
    )
    if (this.stopRequested) {
      return false
    }
    if (this.crashed) {
      return this.failCrashed()
    }
    if (!listening) {
      return this.failStart(this.exited ? 'exited' : 'port-timeout')
    }
    this.portOpened = true
    if (this.waitsForRegistration) {
      this.update({ status: 'registering' })
      const registered = await this.awaitRegistration()
      if (this.stopRequested) {
        return false
      }
      if (this.crashed) {
        return this.failCrashed()
      }
      if (!registered) {
        return this.failStart(this.exited ? 'exited' : 'register-timeout')
      }
    }
    this.update({ status: 'ready', readyAt: Date.now() })
    return true
  }

  private async failStart(code: ProblemCode): Promise<false> {
    this.update({ status: 'failed', problem: { code, detail: await this.failureDetail() } })
    return false
  }

  /**
   * The start's main thread died: the JVM left behind holds nothing (no player is loaded before the port opens, and the registration comes
   * last), so it is ended, and the reason is the first error the start logged. The errors that follow it come within a second.
   */
  private async failCrashed(): Promise<false> {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    if (this.pid !== null) {
      killProcess(this.pid)
      await this.waitUntilGone(KILL_TIMEOUT_MS)
    }
    const errors = this.startErrors.filter((line) => !line.includes(FATAL_LINE))
    const reason = errors.find((line) => ERROR_LINE.test(line)) ?? errors[0] ?? ''
    // the logger's prefix (date, level, thread, class) says nothing to a player
    const detail = reason.replace(/^.*? ERROR +\[[^\]]*\] +\S+ +- +/, '').trim()
    this.update({ status: 'failed', problem: { code: 'start-crashed', detail } })
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
    parts.push(...(await lastLines(join(this.logDir, STDERR_FILE), 15)))
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
    this.stopRequested = true
    if (!this.hasProcess) {
      this.finishStopped()
      return true
    }
    this.update({ status: 'stopping', problem: undefined })
    // Before its port opens the game server has loaded neither players nor bots, and has neither its shutdown hook nor the request watch yet:
    // ending it loses nothing, where a request would go unanswered.
    const graceful = this.definition.id === 'game' && this.portOpened
    if (graceful) {
      const request = join(this.definition.dir, 'shutdown.request')
      await writeFile(request, '')
      const answered = await waitFor(
        async () => !(await exists(request)) || (this.knowsProcess && (await this.isGone())),
        REQUEST_UNANSWERED_MS
      )
      if (!answered) {
        // A server built before the watcher: the file would otherwise be left for a later run.
        await rm(request, { force: true })
        return this.failStop({ code: 'stop-unanswered' })
      }
      if (!(await this.waitUntilGone(STOP_TIMEOUT_MS))) {
        return this.failStop({ code: 'stop-timeout' })
      }
    } else {
      // The chat and login servers keep nothing that a shutdown would save, and neither does a game server still loading its data.
      if (this.pid !== null) {
        killProcess(this.pid)
      } else if (this.state.external) {
        return this.failStop({ code: 'stop-unknown-process' })
      }
      if (!(await this.waitUntilGone(KILL_TIMEOUT_MS))) {
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
    const gone = await this.waitUntilGone(KILL_TIMEOUT_MS)
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
    this.portOpened = false
    this.update({ status: 'stopped', external: false, problem: undefined })
  }

  dispose(): void {
    this.tail.stop()
    this.stopWatching()
    this.removeAllListeners()
  }
}

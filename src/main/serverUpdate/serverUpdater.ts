import { EventEmitter } from 'node:events'
import { compareVersions, type Problem, type ServerUpdateState, type ServerUpdateStep } from '../../shared/types'
import type { Launcher } from '../launcher'
import { findMysqlBinDir } from '../server/mysql'
import { jdkMajorVersion } from '../system/java'
import { ServerFeed, type ServerRelease } from './feed'
import { CorruptError, ServerInstaller, type UpdatePlan } from './installer'
import { readInstallOrigin, type ReleaseManifest } from './manifest'
import { runServerScript, tail } from './powershell'

const SQL_TIMEOUT_MS = 30 * 60 * 1000

/** Runs the server's SQL script (`apply-sql.ps1`) with these arguments: its exit code and everything it said. */
const runSqlScript = (script: string, args: string[]): Promise<{ code: number; output: string }> => runServerScript(script, args, SQL_TIMEOUT_MS)

/**
 * The server's own update, for a beta launcher the server's pre-releases too (release process plan, milestone 6). It looks for a newer release
 * at start, when the server folder changes and every few hours; the person asks for it, the bundle and the maps it needs are downloaded and
 * checked with every server still running, and only once the person has seen what will happen (default files they edited, kept; a database
 * that never went through the SQL script) are the servers stopped, the files changed, the SQL applied and the servers started again. The last
 * update can be undone. A development install (one the server's deploy script wrote) is never offered a release.
 */
export class ServerUpdater extends EventEmitter<{ state: [ServerUpdateState] }> {
  private state: ServerUpdateState = { status: 'off', installed: null }
  private release: ServerRelease | null = null
  private previous: ReleaseManifest | null = null
  private plan: UpdatePlan | null = null
  private checking = false

  constructor(
    private readonly launcher: Launcher,
    private readonly beta: boolean,
    /** In the developer mode, no release is looked for: GitHub is not asked. */
    private readonly developer: () => boolean = () => false,
    private readonly feed = new ServerFeed()
  ) {
    super()
  }

  get current(): ServerUpdateState {
    return this.state
  }

  private get root(): string | null {
    return this.launcher.currentLayout?.root ?? null
  }

  private installer(): ServerInstaller | null {
    const root = this.root
    return root ? new ServerInstaller(root, this.feed) : null
  }

  /**
   * Looks at the install and the releases: when the launcher has found the server folder at its start, or another one is chosen; never on a
   * timer, the start is what shows a new release. Not while an update is being prepared, waits for the person or runs.
   */
  async check(): Promise<void> {
    const busy = this.state.status === 'preparing' || this.state.status === 'confirm' || this.state.status === 'installing'
    const installer = this.installer()
    if (busy || this.checking) {
      return
    }
    if (!installer) {
      this.set({ status: 'off', installed: null })
      return
    }
    this.checking = true
    try {
      const origin = await readInstallOrigin(this.root!)
      const last = await installer.lastUpdate()
      const canReturnTo = last ? { version: last.record.from } : undefined
      if (origin.source === 'deploy') {
        this.set({ status: 'dev', installed: 'dev', revision: origin.revision, canReturnTo })
        return
      }
      this.previous = origin.source === 'release' ? origin.manifest : null
      const installed = this.previous?.version ?? null
      if (this.developer()) {
        this.release = null
        this.set({ status: 'developer', installed, canReturnTo })
        return
      }
      let newest: ServerRelease | null
      try {
        newest = await this.feed.newest(this.beta)
      } catch (error) {
        this.set({ status: 'off', installed, canReturnTo, problem: { code: 'update-feed-failed', detail: (error as Error).message } })
        return
      }
      if (newest && (installed === null || (compareVersions(newest.tag, installed) ?? 0) > 0)) {
        this.release = newest
        this.set({ status: 'available', installed, available: { version: newest.tag, notes: newest.notes }, canReturnTo })
      } else {
        this.release = null
        this.set({ status: 'current', installed, canReturnTo })
      }
    } finally {
      this.checking = false
    }
  }

  /** Downloads and checks everything the update needs, and works out what it will change; no server is touched. */
  async prepare(): Promise<void> {
    const release = this.release
    const installer = this.installer()
    if (this.state.status !== 'available' && this.state.status !== 'failed') {
      return
    }
    if (!release || !installer) {
      return
    }
    const base = { installed: this.state.installed, available: { version: release.tag, notes: release.notes }, canReturnTo: this.state.canReturnTo }
    const progress = (step: ServerUpdateStep) => (percent: number) => this.set({ ...base, status: 'preparing', step, percent })
    try {
      progress('download')(0)
      await installer.fetchBundle(release, progress('download'))
      progress('verify')(0)
      const plan = await installer.plan(release, this.previous)
      progress('navmesh')(0)
      await installer.fetchNavmesh(release, plan, progress('navmesh'))
      const found = await jdkMajorVersion(this.root)
      const jdk = { needed: release.manifest.java, found, ok: found !== null && found >= release.manifest.java }
      const mysql = await this.launcher.ensureMysql()
      if (mysql) {
        this.fail(base, mysql)
        return
      }
      const staged = installer.stagedSqlScript(release)
      const look = await runSqlScript(staged.script, [...(await this.sqlArgs()), '-SqlFile', staged.sql])
      if (look.code !== 0) {
        this.fail(base, { code: 'update-sql-failed', detail: tail(look.output) })
        return
      }
      this.plan = plan
      this.set({ ...base, status: 'confirm', keptLocal: plan.keepLocal, markApplied: /^Ledger: absent/m.test(look.output), jdk })
    } catch (error) {
      this.fail(base, { code: error instanceof CorruptError ? 'update-corrupt' : 'update-download-failed', detail: (error as Error).message })
    }
  }

  /** The person saw what will happen and said yes: the servers stopped, the files changed, the SQL run, the servers started again. */
  async install(): Promise<Problem | null> {
    const release = this.release
    const plan = this.plan
    const installer = this.installer()
    const confirmed = this.state
    if (confirmed.status !== 'confirm' || !release || !plan || !installer) {
      return { code: 'launcher-busy' }
    }
    if (!confirmed.jdk?.ok) {
      return { code: 'update-jdk-missing', detail: String(confirmed.jdk?.needed ?? '') }
    }
    const base = { installed: confirmed.installed, available: confirmed.available, keptLocal: confirmed.keptLocal, markApplied: confirmed.markApplied, jdk: confirmed.jdk }
    const step = (current: ServerUpdateStep): void => this.set({ ...base, status: 'installing', step: current })
    const problem = await this.launcher.withServersStopped(async () => {
      step('files')
      try {
        await installer.apply(release, plan, confirmed.installed)
      } catch (error) {
        return { code: 'update-files-failed', detail: (error as Error).message }
      }
      step('sql')
      const mysql = await this.launcher.ensureMysql()
      if (mysql) {
        return mysql
      }
      const sql = await runSqlScript(installer.sqlScript(), [...(await this.sqlArgs()), '-Apply', ...(confirmed.markApplied ? ['-MarkApplied'] : [])])
      return sql.code === 0 ? null : { code: 'update-sql-failed', detail: tail(sql.output) }
    }, step)
    this.plan = null
    if (problem) {
      // the files may have changed before the step that failed: the way back is offered at once
      const last = await installer.lastUpdate()
      this.fail({ ...base, canReturnTo: last ? { version: last.record.from } : undefined }, problem)
      return problem
    }
    this.set({ status: 'current', installed: release.tag })
    await this.check()
    return null
  }

  /** The person changed their mind at the confirmation: what was downloaded is thrown away. */
  async cancel(): Promise<void> {
    if (this.state.status !== 'confirm' && this.state.status !== 'failed') {
      return
    }
    this.plan = null
    await this.installer()?.discardStaging()
    this.set({ status: 'off', installed: this.state.installed })
    await this.check()
  }

  /** Puts back the files the last update replaced, the servers stopped for it. The database keeps what the SQL changed. */
  async undo(): Promise<Problem | null> {
    const installer = this.installer()
    const busy = this.state.status === 'preparing' || this.state.status === 'confirm' || this.state.status === 'installing'
    if (!installer || busy) {
      return { code: 'launcher-busy' }
    }
    if (!(await installer.lastUpdate())) {
      return { code: 'update-nothing-to-return' }
    }
    const base = { installed: this.state.installed }
    const problem = await this.launcher.withServersStopped(async () => {
      this.set({ ...base, status: 'installing', step: 'return' })
      try {
        await installer.undo()
        return null
      } catch (error) {
        return { code: 'update-files-failed', detail: (error as Error).message }
      }
    }, (current) => this.set({ ...base, status: 'installing', step: current }))
    if (problem) {
      const last = await installer.lastUpdate()
      this.fail({ ...base, canReturnTo: last ? { version: last.record.from } : undefined }, problem)
      return problem
    }
    this.set({ status: 'off', installed: null })
    await this.check()
    return null
  }

  private async sqlArgs(): Promise<string[]> {
    const args = ['-ServerRoot', this.root!]
    const bin = await findMysqlBinDir(this.root)
    return bin ? [...args, '-MysqlBin', bin] : args
  }

  private fail(base: Omit<ServerUpdateState, 'status'>, problem: Problem): void {
    this.set({ ...base, status: 'failed', problem })
  }

  private set(state: ServerUpdateState): void {
    this.state = state
    this.emit('state', state)
  }
}

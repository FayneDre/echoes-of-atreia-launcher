import { execFile } from 'node:child_process'
import type { MysqlState, Problem } from '../../shared/types'
import { isPortOpen } from '../system/network'
import { waitFor } from './wait'

const START_TIMEOUT_MS = 60_000

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

/** The name of the MySQL or MariaDB Windows service, if one is installed. */
async function findService(): Promise<string | null> {
  if (process.platform !== 'win32') {
    return null
  }
  const { stdout } = await runPowerShell(
    `Get-CimInstance Win32_Service | Where-Object { $_.Name -match 'mysql|mariadb' } | Select-Object -First 1 -ExpandProperty Name`
  )
  const name = stdout.trim()
  return /^[\w.-]+$/.test(name) ? name : null
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

/** MySQL as the launcher sees it: up when its port answers, and started or stopped through its Windows service. */
export class MysqlControl {
  private state: MysqlState = { status: 'unknown', serviceName: null, port: null }
  private address: { host: string; port: number } | null = null

  constructor(private readonly onChange: (state: MysqlState) => void) {}

  get current(): MysqlState {
    return this.state
  }

  private update(next: Partial<MysqlState>): void {
    this.state = { ...this.state, ...next }
    this.onChange(this.state)
  }

  private isUp(): Promise<boolean> {
    return this.address ? isPortOpen(this.address.port, this.address.host) : Promise.resolve(false)
  }

  async refresh(address: { host: string; port: number } | null): Promise<void> {
    this.address = address
    if (!address) {
      this.update({ status: 'unknown', port: null, problem: undefined })
      return
    }
    if (await this.isUp()) {
      this.update({ status: 'ready', port: address.port, problem: undefined, serviceName: this.state.serviceName ?? (await findService()) })
      return
    }
    const serviceName = await findService()
    this.update({ status: serviceName ? 'stopped' : 'missing', serviceName, port: address.port, problem: undefined })
  }

  async start(): Promise<Problem | null> {
    if (await this.isUp()) {
      this.update({ status: 'ready', problem: undefined })
      return null
    }
    const name = this.state.serviceName ?? (await findService())
    if (!name) {
      return this.fail('stopped', { code: 'mysql-missing' })
    }
    this.update({ status: 'starting', serviceName: name, problem: undefined })
    const code = await controlService(name, 'start')
    if (code === DECLINED) {
      return this.fail('stopped', { code: 'mysql-refused' })
    }
    if (!(await waitFor(() => this.isUp(), START_TIMEOUT_MS, 1000))) {
      return this.fail('stopped', { code: 'mysql-timeout', detail: `sc start ${name}: ${code}` })
    }
    this.update({ status: 'ready' })
    return null
  }

  async stop(): Promise<Problem | null> {
    const name = this.state.serviceName ?? (await findService())
    if (!name) {
      return this.fail(this.state.status, { code: 'mysql-missing' })
    }
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

  private fail(status: MysqlState['status'], problem: Problem): Problem {
    this.update({ status, problem })
    return problem
  }
}

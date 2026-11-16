import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

/** How long the output may still come in once the script has exited: a program it left running (MySQL) may hold its pipes for good. */
const CLOSE_GRACE_MS = 2_000
/** How long the kill past the time given may take before the script is given up on, killed or not. */
const KILL_GRACE_MS = 10_000

export interface ScriptOptions {
  /** The file everything the script says is written to as it says it, so that a script that never ends still leaves what it did. */
  logFile?: string
  /** Each line the script says, as it says it. */
  onLine?: (line: string) => void
}

/**
 * Runs one of the server's scripts (`apply-sql.ps1`, `setup-mysql.ps1`) with these arguments: its exit code and everything it said. Past
 * the time given, the script and every program it started are killed: killing PowerShell alone left its children holding the output open,
 * and the launcher waiting on them. Done when the script exits, whatever still holds its output.
 */
export function runServerScript(script: string, args: string[], timeoutMs: number, options: ScriptOptions = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const log = options.logFile ? createWriteStream(options.logFile, { flags: 'a' }) : null
    log?.on('error', () => {
      // the log is a help for later: a file that cannot be written never fails the script
    })
    log?.write(`---- ${new Date().toISOString()} ${script} ${args.join(' ')}\r\n`)
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true })
    let output = ''
    let partial = ''
    // decoded by the streams: a letter cut between two chunks stays whole
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    const take = (text: string): void => {
      output += text
      log?.write(text)
      const lines = (partial + text).split(/\r?\n/)
      partial = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) {
          options.onLine?.(line)
        }
      }
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      log?.write(`\r\n---- no end after ${Math.round(timeoutMs / 1000)} s: the script and what it started are stopped\r\n`)
      if (child.pid) {
        execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
      }
      // a kill that did not take (a protected process) must not leave the launcher waiting all the same
      setTimeout(() => finish(-1), KILL_GRACE_MS)
    }, timeoutMs)

    let done = false
    const finish = (code: number): void => {
      if (done) {
        return
      }
      done = true
      clearTimeout(timer)
      child.stdout.removeListener('data', take)
      child.stderr.removeListener('data', take)
      log?.end(`\r\n---- exit ${code}\r\n`)
      resolve({ code, output: output.trim() })
    }
    child.on('error', (error) => {
      output += `\n${error.message}`
      finish(-1)
    })
    child.on('close', (code) => finish(timedOut || code === null ? -1 : code))
    child.on('exit', (code) => {
      setTimeout(() => finish(timedOut || code === null ? -1 : code), CLOSE_GRACE_MS)
    })
  })
}

/** The last lines of what a script said, for a problem's detail. */
export const tail = (text: string): string => text.split(/\r?\n/).filter(Boolean).slice(-6).join('\n')

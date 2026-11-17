import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { basename } from 'node:path'

/** How long the output may still come in once the script has exited: a program it left running (MySQL) may hold its pipes for good. */
const CLOSE_GRACE_MS = 2_000
/** How long the kill past the time given may take before the script is given up on, killed or not. */
const KILL_GRACE_MS = 10_000

export interface ScriptOptions {
  /** The file everything the script says is written to as it says it, so that a script that never ends still leaves what it did. */
  logFile?: string
  /** Each line the script says on its output, as it says it: its progress. What it says on its error stream is never one. */
  onLine?: (line: string) => void
}

/** What a script said: `output` everything in the order said, `errors` its error stream alone (where PowerShell writes a failure). */
export interface ScriptResult {
  code: number
  output: string
  errors: string
}

/**
 * Runs one of the server's scripts (`apply-sql.ps1`, `setup-mysql.ps1`) with these arguments: its exit code and everything it said. Past
 * the time given, the script and every program it started are killed: killing PowerShell alone left its children holding the output open,
 * and the launcher waiting on them. Done when the script exits, whatever still holds its output.
 */
export function runServerScript(script: string, args: string[], timeoutMs: number, options: ScriptOptions = {}): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const log = options.logFile ? createWriteStream(options.logFile, { flags: 'a' }) : null
    log?.on('error', () => {
      // the log is a help for later: a file that cannot be written never fails the script
    })
    log?.write(`---- ${new Date().toISOString()} ${script} ${args.join(' ')}\r\n`)
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], { windowsHide: true })
    let output = ''
    let errors = ''
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
    // an error record shown as the step under way read as progress (the tester's "+ FullyQualifiedErrorId" under "Making the database")
    const takeError = (text: string): void => {
      output += text
      errors += text
      log?.write(text)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', takeError)

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
      child.stderr.removeListener('data', takeError)
      log?.end(`\r\n---- exit ${code}\r\n`)
      resolve({ code, output: output.trim(), errors: errors.trim() })
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

/** Where Windows PowerShell says an error happened, in English or in French ("Au caractère", its accent read wrong from an older script). */
const ERROR_AT = /^(?:At|Au caract.{1,2}re)\s+(.+?):(\d+)\s*(?:char:|:)\s*\d+/

/** A line of an error record's tail (`+ CategoryInfo`, `+ ~~~~`): it says nothing to a player. */
const recordLine = (line: string): boolean => line.trimStart().startsWith('+')

/**
 * Why a script failed, for a problem's detail: the message of the last error PowerShell wrote and the script and line it came from
 * ("Remove-Item : An object at the specified path… (apply-sql.ps1:286)"), not the last lines of its record. Without an error record, the
 * last lines the script said.
 */
export function scriptFailure(result: ScriptResult): string {
  const lines = result.errors.split(/\r?\n/).filter((line) => line.trim())
  let at = lines.length - 1
  while (at >= 0 && !ERROR_AT.test(lines[at])) {
    at--
  }
  if (at < 0) {
    const messages = lines.filter((line) => !recordLine(line))
    return messages.length ? messages.slice(-6).join('\n') : tail(result.output) || `exit ${result.code}`
  }
  // the message runs from the end of the record before it to the place
  let start = at
  while (start > 0 && !recordLine(lines[start - 1])) {
    start--
  }
  const [, file, line] = ERROR_AT.exec(lines[at]) ?? []
  const message = lines.slice(start, at).map((text) => text.trim()).join('\n') || tail(result.output)
  return `${message} (${basename(file)}:${line})`
}

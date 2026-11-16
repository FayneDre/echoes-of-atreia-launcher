import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Problem } from '../../shared/types'
import { runServerScript, tail } from './powershell'

/** How long the probe script may take: PowerShell's own start on a slow machine, and the port listing under test. */
const PROBE_TIMEOUT_MS = 60_000
/** Past this, listing the ports is too slow for `start-mysql.ps1`, which asks every half second while it waits for MySQL. */
export const SLOW_PORTS_MS = 10_000
/** How long a program of a runtime may take to say its version. */
const RUNTIME_TIMEOUT_MS = 30_000
/** The probe, written into the server's folder for its run and removed after. */
export const PROBE_FILE = '.echoes-check.ps1'

/**
 * What the database's scripts need of PowerShell, tried in a few seconds: a script file run at all (a policy can forbid it), the full
 * language (a locked-down machine gives scripts a constrained one, where `setup-mysql.ps1` cannot make its passwords), and the listing of
 * the ports, which a slow WMI can stretch to minutes.
 */
const PROBE = `$ErrorActionPreference = 'Stop'
Write-Output "language=$($ExecutionContext.SessionState.LanguageMode)"
$watch = [Diagnostics.Stopwatch]::StartNew()
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Out-Null
Write-Output "ports-ms=$($watch.ElapsedMilliseconds)"
Write-Output 'probe=done'
`

type ScriptRunner = typeof runServerScript

/** What the probe said: `name=value` lines. */
function probeValues(output: string): Map<string, string> {
  return new Map(
    output
      .split(/\r?\n/)
      .map((line) => /^(\w[\w-]*)=(.*)$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1]!, match[2]!.trim()])
  )
}

/**
 * Before anything is downloaded: the folder takes files, and PowerShell runs the database's scripts as they need. The problem found first,
 * or null.
 */
export async function checkMachine(folder: string, runScript: ScriptRunner = runServerScript): Promise<Problem | null> {
  const probe = join(folder, PROBE_FILE)
  try {
    await mkdir(folder, { recursive: true })
    await writeFile(probe, PROBE)
  } catch (error) {
    return { code: 'setup-check-folder', detail: `${folder}: ${(error as Error).message}` }
  }
  try {
    const result = await runScript(probe, [], PROBE_TIMEOUT_MS)
    const values = probeValues(result.output)
    // said first: in a constrained language the rest of the probe fails, and this is why
    const language = values.get('language')
    if (language && language !== 'FullLanguage') {
      return { code: 'setup-check-language', detail: language }
    }
    if (result.code !== 0 || values.get('probe') !== 'done') {
      return { code: 'setup-check-powershell', detail: tail(result.output) || `exit ${result.code}` }
    }
    const portsMs = Number(values.get('ports-ms'))
    if (!(portsMs < SLOW_PORTS_MS)) {
      return { code: 'setup-check-ports', detail: `${Math.round(portsMs / 1000)} s` }
    }
    return null
  } finally {
    await rm(probe, { force: true })
  }
}

/** Whether a program starts and ends: its error when it does not (blocked, a library missing, no end). */
function runs(program: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(program, args, { timeout: RUNTIME_TIMEOUT_MS, windowsHide: true }, (error, _stdout, stderr) => {
        resolve(error ? `${error.message}${stderr ? `\n${tail(stderr)}` : ''}`.trim() : null)
      })
    } catch (error) {
      // a file Windows does not take for a program fails at once, before any callback
      resolve((error as Error).message)
    }
  })
}

/**
 * Once the runtimes are unpacked and before the bundle and the maps (most of the download): MySQL and Java each say their version, which
 * an antivirus that blocks them, or a missing system library, keeps them from doing. `runtimes` maps each runtime's target (`mysql`,
 * `runtime`) to the folder it was unpacked into.
 */
export async function checkRuntimes(runtimes: Record<string, string>): Promise<Problem | null> {
  const programs: [string, string, string[]][] = [
    ['mysql', join('bin', 'mysqld.exe'), ['--version']],
    ['runtime', join('bin', 'java.exe'), ['-version']]
  ]
  for (const [target, program, args] of programs) {
    const folder = runtimes[target]
    if (!folder) {
      continue
    }
    const failure = await runs(join(folder, program), args)
    if (failure) {
      return { code: 'setup-check-runtime', detail: `${program}: ${failure}` }
    }
  }
  return null
}

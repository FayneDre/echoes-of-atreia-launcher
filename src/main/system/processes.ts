import { execFile } from 'node:child_process'

/** Whether a process id is alive. Signal 0 only checks; EPERM means it exists but belongs to someone else. */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * The process id of a running server whose command line names this main class, for a server the launcher did not start itself. Matched on
 * the command line only, whatever the executable is called (java.exe, javaw.exe, a bundled runtime); the query's own shell, which names the
 * class too, is left out. Windows only for now; elsewhere null.
 */
export function findJavaProcess(mainClass: string): Promise<number | null> {
  if (process.platform !== 'win32' || !/^[\w.]+$/.test(mainClass)) {
    return Promise.resolve(null)
  }
  const script =
    `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${mainClass}*' } | ` +
    `Select-Object -First 1 -ExpandProperty ProcessId`
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20_000, windowsHide: true }, (error, stdout) => {
      const pid = Number.parseInt(stdout.trim(), 10)
      resolve(error || Number.isNaN(pid) ? null : pid)
    })
  })
}

/** Ends a process at once. Never the game server while it can still stop by itself: this skips the shutdown that saves the players. */
export function killProcess(pid: number): void {
  try {
    process.kill(pid)
  } catch {
    // already gone
  }
}

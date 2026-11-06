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
 * The process ids of the running processes whose command line names this main class, for a server the launcher did not start itself.
 * Matched on the command line only, whatever the executable is called (java.exe, javaw.exe, a bundled runtime); the query's own shell, which
 * names the class too, is left out. The command line does not say which install a server runs from (`-cp "libs/*"` is relative), so two
 * installs, or a server started from another folder, give two ids: the caller must not pick one. Windows only for now; elsewhere none.
 */
export function findJavaProcesses(mainClass: string): Promise<number[]> {
  if (process.platform !== 'win32' || !/^[\w.]+$/.test(mainClass)) {
    return Promise.resolve([])
  }
  const script =
    `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like '*${mainClass}*' } | ` +
    `Select-Object -ExpandProperty ProcessId`
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 20_000, windowsHide: true }, (error, stdout) => {
      const ids = stdout
        .split(/\s+/)
        .map((word) => Number.parseInt(word, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
      resolve(error ? [] : ids)
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

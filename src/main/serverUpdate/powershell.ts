import { execFile } from 'node:child_process'

/** Runs one of the server's scripts (`apply-sql.ps1`, `setup-mysql.ps1`) with these arguments: its exit code and everything it said. */
export function runServerScript(script: string, args: string[], timeoutMs: number): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : -1) : 0
        resolve({ code, output: `${stdout}\n${stderr}`.trim() })
      }
    )
  })
}

/** The last lines of what a script said, for a problem's detail. */
export const tail = (text: string): string => text.split(/\r?\n/).filter(Boolean).slice(-6).join('\n')

import { execFile } from 'node:child_process'

/**
 * A process's memory in megabytes, as Windows' Task Manager shows it (its working set), or null when it is gone or cannot be read. `tasklist`
 * answers one CSV line: "java.exe","1234","Console","1","2 345 678 K", the last field grouped by the system's locale.
 */
export function processMemoryMb(pid: number): Promise<number | null> {
  if (process.platform !== 'win32') {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 10_000 }, (error, stdout) => {
      const fields = error ? null : stdout.trim().match(/"([^"]*)"/g)
      const kilobytes = fields && fields.length >= 5 ? Number(fields[4]!.replace(/\D/g, '')) : NaN
      resolve(Number.isFinite(kilobytes) && kilobytes > 0 ? Math.round(kilobytes / 1024) : null)
    })
  })
}

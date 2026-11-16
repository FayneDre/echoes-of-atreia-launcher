import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runServerScript } from '../../src/main/serverUpdate/powershell'

/** Whether a process of this id still runs. */
function running(pid: number): boolean {
  return execFileSync('tasklist.exe', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' }).includes(String(pid))
}

describe('a server script run by the launcher', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'echoes-script-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('is done when it exits, though a program it left running holds its output, and its lines are logged as said', async () => {
    // as setup-mysql.ps1 leaves MySQL running: here a child sharing the script's console and output for 60 s
    const script = join(root, 'leaves-a-child.ps1')
    await writeFile(
      script,
      `Write-Host 'Making the data folder...'\r\n` +
        `$child = Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep 60' -NoNewWindow -PassThru\r\n` +
        `Set-Content (Join-Path '${root}' 'child.pid') $child.Id\r\n` +
        `Write-Host 'MySQL is up (port 3307)'\r\n`
    )
    const log = join(root, 'setup.log')
    const lines: string[] = []
    const started = Date.now()
    const result = await runServerScript(script, [], 30_000, { logFile: log, onLine: (line) => lines.push(line) })
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(result.code).toBe(0)
    expect(lines).toEqual(['Making the data folder...', 'MySQL is up (port 3307)'])
    expect(await readFile(log, 'utf8')).toMatch(/Making the data folder\.\.\.[\s\S]*MySQL is up \(port 3307\)[\s\S]*---- exit 0/)
    execFileSync('taskkill.exe', ['/PID', (await readFile(join(root, 'child.pid'), 'utf8')).trim(), '/T', '/F'])
  }, 40_000)

  it('past its time, is stopped with everything it started, and says so in its log', async () => {
    const script = join(root, 'never-ends.ps1')
    await writeFile(
      script,
      `Write-Host 'Starting MySQL...'\r\n` +
        `$child = Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep 60' -NoNewWindow -PassThru\r\n` +
        `Set-Content (Join-Path '${root}' 'child.pid') $child.Id\r\n` +
        `Start-Sleep 60\r\n`
    )
    const log = join(root, 'setup.log')
    const started = Date.now()
    const result = await runServerScript(script, [], 4_000, { logFile: log })
    expect(Date.now() - started).toBeLessThan(15_000)
    expect(result.code).toBe(-1)
    expect(result.output).toContain('Starting MySQL...')
    expect(await readFile(log, 'utf8')).toContain('no end after 4 s')
    const child = Number((await readFile(join(root, 'child.pid'), 'utf8')).trim())
    await expect.poll(() => running(child), { timeout: 5_000 }).toBe(false)
  }, 40_000)
})

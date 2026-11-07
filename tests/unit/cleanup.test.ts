import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanUp } from '../../src/main/system/cleanup'
import type { ServerLayout } from '../../src/main/server/installation'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 10, 7, 12)
/** The launcher sends to the recycle bin; here the files are simply deleted. */
const remove = (path: string): Promise<void> => rm(path)

describe('cleanUp', () => {
  let root: string
  let layout: ServerLayout

  async function file(path: string, bytes: number, daysAgo: number): Promise<string> {
    const full = join(root, path)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, Buffer.alloc(bytes))
    const when = new Date(NOW - daysAgo * DAY)
    await utimes(full, when, when)
    return full
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'echoes-cleanup-'))
    const definition = (id: 'chat' | 'login' | 'game', folder: string): ServerLayout['servers']['game'] => ({
      id,
      dir: join(root, folder),
      javaArgs: [],
      mainClass: 'Main',
      port: 1
    })
    layout = {
      root,
      servers: { chat: definition('chat', 'chat-server'), login: definition('login', 'login-server'), game: definition('game', 'game-server') },
      loginClientPort: 2106,
      mysql: { host: 'localhost', port: 3306 }
    }
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('removes the archives past the days, then the oldest past the budget, of all three servers together', async () => {
    const old = await file('chat-server/log/archived/old.zip', 10, 40)
    const recent = await file('game-server/log/archived/recent.zip', 60, 1)
    const middle = await file('game-server/log/archived/middle.zip', 60, 5)
    const oldest = await file('login-server/log/archived/oldest-in-month.zip', 60, 20)
    const current = await file('game-server/log/server_console.log', 500, 60)
    const measures = await file('game-server/log/bot-measures/report.zip', 10, 90)

    const result = await cleanUp(layout, remove, NOW, { archiveDays: 30, archiveBytes: 150, reportsKept: 10 })
    expect(result).toEqual({ files: 2, bytes: 70 })
    expect(existsSync(old)).toBe(false)
    // 60 + 60 fit in 150, the third one does not: the oldest goes
    expect(existsSync(oldest)).toBe(false)
    expect(existsSync(recent) && existsSync(middle)).toBe(true)
    // never touched: the current log, what the measurement tools wrote
    expect(existsSync(current) && existsSync(measures)).toBe(true)
  })

  it('keeps the newest reports, and nothing else in their folder is touched', async () => {
    const reports = []
    for (let index = 0; index < 4; index++) {
      reports.push(await file(`reports/report-2026-11-0${index + 1}_10-00-00.zip`, 5, 4 - index))
    }
    const other = await file('reports/notes.txt', 5, 30)
    const result = await cleanUp(layout, remove, NOW, { archiveDays: 30, archiveBytes: 1024, reportsKept: 2 })
    expect(result.files).toBe(2)
    expect(reports.map((path) => existsSync(path))).toEqual([false, false, true, true])
    expect(existsSync(other)).toBe(true)
  })

  it('counts only what could be removed', async () => {
    await file('game-server/log/archived/old.zip', 10, 40)
    const refusing = (): Promise<void> => Promise.reject(new Error('in use'))
    expect(await cleanUp(layout, refusing, NOW)).toEqual({ files: 0, bytes: 0 })
  })

  it('does nothing on an install that has nothing to clean', async () => {
    expect(await cleanUp(layout, remove, NOW)).toEqual({ files: 0, bytes: 0 })
  })
})

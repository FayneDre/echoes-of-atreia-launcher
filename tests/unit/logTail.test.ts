import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileMentions, LogTail } from '../../src/main/server/logTail'

function waitForLines(collected: string[], count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000
    const check = (): void => {
      if (collected.length >= count) {
        resolve()
      } else if (Date.now() > deadline) {
        reject(new Error(`only ${collected.length} lines: ${collected.join(' | ')}`))
      } else {
        setTimeout(check, 20)
      }
    }
    check()
  })
}

describe('LogTail', () => {
  let dir: string
  let file: string
  let tail: LogTail
  let collected: string[]

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'echoes-tail-'))
    file = join(dir, 'server_console.log')
    tail = new LogTail(file, 25)
    collected = []
    tail.on('lines', (lines) => collected.push(...lines))
  })

  afterEach(() => {
    tail.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  it('skips what a previous run wrote, then follows the file', async () => {
    writeFileSync(file, 'old run\n')
    await tail.start('end')
    appendFileSync(file, 'first\r\nsecond\n')
    await waitForLines(collected, 2)
    expect(collected).toEqual(['first', 'second'])
  })

  it('waits for the end of a line before passing it on', async () => {
    await tail.start('recent')
    writeFileSync(file, 'half')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(collected).toEqual([])
    appendFileSync(file, ' a line\n')
    await waitForLines(collected, 1)
    expect(collected).toEqual(['half a line'])
  })

  it('starts over when the server moves its log aside and writes a new one', async () => {
    writeFileSync(file, 'previous run, a long line that makes the old file bigger than the new one\n')
    await tail.start('end')
    renameSync(file, join(dir, 'server_console-archived.log'))
    writeFileSync(file, 'new run\n')
    await waitForLines(collected, 1)
    expect(collected).toEqual(['new run'])
  })

  it('keeps accented text whole', async () => {
    await tail.start('recent')
    writeFileSync(file, 'Démarrage du serveur — prêt\n')
    await waitForLines(collected, 1)
    expect(collected).toEqual(['Démarrage du serveur — prêt'])
  })

  it('shows only the last lines of a big log, starting on a whole line', async () => {
    const line = 'x'.repeat(99) + '\n'
    writeFileSync(file, line.repeat(5000) + 'the last line\n')
    await tail.start('recent')
    await waitForLines(collected, 1)
    expect(collected.at(-1)).toBe('the last line')
    expect(collected.length).toBeLessThan(3000)
    expect(collected.every((read) => read === 'the last line' || read === 'x'.repeat(99))).toBe(true)
  })
})

describe('fileMentions', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('finds a line anywhere in a file bigger than one read, even cut between two reads', async () => {
    dir = mkdtempSync(join(tmpdir(), 'echoes-mentions-'))
    const file = join(dir, 'big.log')
    // createReadStream reads 64 KiB at a time: the text straddles the first boundary.
    const before = 'a'.repeat(64 * 1024 - 10)
    writeFileSync(file, before + 'Connected to login server\n' + 'b'.repeat(500_000))
    expect(await fileMentions(file, 'Connected to login server')).toBe(true)
    expect(await fileMentions(file, 'Disconnected')).toBe(false)
    expect(await fileMentions(join(dir, 'missing.log'), 'anything')).toBe(false)
  })
})

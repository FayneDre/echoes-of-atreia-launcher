import { appendFileSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LogTail } from '../../src/main/server/logTail'

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
    await tail.start(true)
    appendFileSync(file, 'first\r\nsecond\n')
    await waitForLines(collected, 2)
    expect(collected).toEqual(['first', 'second'])
  })

  it('waits for the end of a line before passing it on', async () => {
    await tail.start(false)
    writeFileSync(file, 'half')
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(collected).toEqual([])
    appendFileSync(file, ' a line\n')
    await waitForLines(collected, 1)
    expect(collected).toEqual(['half a line'])
  })

  it('starts over when the server moves its log aside and writes a new one', async () => {
    writeFileSync(file, 'previous run, a long line that makes the old file bigger than the new one\n')
    await tail.start(true)
    renameSync(file, join(dir, 'server_console-archived.log'))
    writeFileSync(file, 'new run\n')
    await waitForLines(collected, 1)
    expect(collected).toEqual(['new run'])
  })

  it('keeps accented text whole', async () => {
    await tail.start(false)
    writeFileSync(file, 'Démarrage du serveur — prêt\n')
    await waitForLines(collected, 1)
    expect(collected).toEqual(['Démarrage du serveur — prêt'])
  })
})

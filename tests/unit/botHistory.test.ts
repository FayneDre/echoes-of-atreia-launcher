import { describe, expect, it } from 'vitest'
import { BotHistory, HISTORY_SPAN_MS } from '../../src/main/bots/botHistory'

describe('BotHistory', () => {
  it('adds a point for each count it could read, and keeps the last hour only', async () => {
    let now = 0
    let answer: { elyos: number; asmodians: number } | null = { elyos: 3, asmodians: 2 }
    const history = new BotHistory(async () => answer, 60_000, () => now)

    await history.sample()
    now = 60_000
    answer = null // the game server down: no point
    await history.sample()
    now = 120_000
    answer = { elyos: 4, asmodians: 1 }
    await history.sample()
    expect(history.current).toEqual([
      { at: 0, elyos: 3, asmodians: 2 },
      { at: 120_000, elyos: 4, asmodians: 1 }
    ])

    now = HISTORY_SPAN_MS + 60_000
    expect(history.current).toEqual([{ at: 120_000, elyos: 4, asmodians: 1 }])
  })

  it('takes a failed count as a gap', async () => {
    const history = new BotHistory(() => Promise.reject(new Error('refused')), 60_000)
    await history.sample()
    expect(history.current).toEqual([])
  })
})

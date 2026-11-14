import { describe, expect, it } from 'vitest'
import { registrationOverdue } from '../../src/main/server/serverProcess'

const MINUTE = 60_000

describe('registrationOverdue', () => {
  it('waits past ten minutes for a game server that still writes', () => {
    // a first start making its bots: twelve minutes in, its last line a minute ago
    expect(registrationOverdue(0, 11 * MINUTE, 12 * MINUTE)).toBe(false)
  })

  it('gives up on a game server silent for five minutes', () => {
    expect(registrationOverdue(0, 6 * MINUTE, 11 * MINUTE)).toBe(true)
    // nothing written since the wait began
    expect(registrationOverdue(0, 0, 5 * MINUTE)).toBe(true)
    expect(registrationOverdue(0, 0, 4 * MINUTE)).toBe(false)
  })

  it('counts the silence from the wait, not from a line written before it', () => {
    expect(registrationOverdue(10 * MINUTE, 2 * MINUTE, 13 * MINUTE)).toBe(false)
  })

  it('gives up after an hour however much it writes', () => {
    expect(registrationOverdue(0, 60 * MINUTE, 60 * MINUTE)).toBe(true)
  })
})

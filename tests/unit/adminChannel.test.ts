import { describe, expect, it } from 'vitest'
import { parseAnswer, parseDestinations } from '../../src/main/server/adminChannel'

describe('parseAnswer', () => {
  it('reads ok with its data lines', () => {
    expect(parseAnswer('ok\na\nb\n')).toEqual({ ok: true, lines: ['a', 'b'] })
  })
  it('reads an error with its reason', () => {
    expect(parseAnswer('error not in game\n')).toEqual({ ok: false, error: 'not in game' })
  })
  it('does not take anything else for ok', () => {
    expect(parseAnswer('okay')).toEqual({ ok: false, error: 'okay' })
  })
})

describe('parseDestinations', () => {
  it('reads tab-separated places and leaves out the malformed ones', () => {
    expect(parseDestinations(['7\t110010000\t1.5\t2\t3\tSanctum Gate', 'x\t1\t1\t1\t1\tBad', '8\t1\t1\t1\t1\t'])).toEqual([
      { id: 7, mapId: 110010000, x: 1.5, y: 2, z: 3, name: 'Sanctum Gate' }
    ])
  })
})

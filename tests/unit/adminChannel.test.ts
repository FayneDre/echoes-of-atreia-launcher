import { describe, expect, it } from 'vitest'
import { parseAnswer, parseDestinations, parsePopulation } from '../../src/main/server/adminChannel'

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

describe('parsePopulation', () => {
  it('reads the density, the totals and the guard', () => {
    expect(
      parsePopulation(['mode FIXED', 'percent 60', 'awake 900', 'wanted 1000', 'asleep 300', 'short 2', 'guard held HEAP ROUTES', 'heap 86', 'route-wait 25'])
    ).toEqual({
      mode: 'FIXED',
      percent: 60,
      totals: { awake: 900, wanted: 1000, asleep: 300, short: 2 },
      guard: { state: 'held', causes: ['HEAP', 'ROUTES'] },
      heapPercent: 86,
      routeWaitSeconds: 25
    })
  })
  it('has no totals before the first review, and no heap before the first collection', () => {
    expect(parsePopulation(['mode AUTO', 'percent 30', 'guard open', 'heap unknown', 'route-wait 0'])).toEqual({
      mode: 'AUTO',
      percent: 30,
      totals: null,
      guard: { state: 'open', causes: [] },
      heapPercent: null,
      routeWaitSeconds: 0
    })
  })
  it('takes an answer without the density or a known guard for unreadable', () => {
    expect(parsePopulation(['percent 30', 'guard open'])).toBeNull()
    expect(parsePopulation(['mode AUTO', 'percent 30', 'guard maybe'])).toBeNull()
  })
})

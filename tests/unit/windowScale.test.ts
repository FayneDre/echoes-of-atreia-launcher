import { describe, expect, it } from 'vitest'
import { DESIGN_HEIGHT, DESIGN_WIDTH, MAX_SCALE, scaleFor } from '../../src/main/windowScale'

describe('scaleFor', () => {
  it('keeps the page as drawn at the first size and below it', () => {
    expect(scaleFor(DESIGN_WIDTH, DESIGN_HEIGHT)).toBe(1)
    expect(scaleFor(960, 640)).toBe(1)
  })

  it('grows with the side that grows the least', () => {
    // a 2560 x 1440 screen at 150 %, maximized: the height limits
    expect(scaleFor(1707, 1019)).toBe(1.3)
    // a wide but short window does not grow past its height
    expect(scaleFor(2400, 800)).toBe(1)
  })

  it('moves in steps of 5 % and stops at its ceiling', () => {
    expect(scaleFor(DESIGN_WIDTH * 1.12, DESIGN_HEIGHT * 1.12)).toBe(1.1)
    expect(scaleFor(3840, 2160)).toBe(MAX_SCALE)
  })
})

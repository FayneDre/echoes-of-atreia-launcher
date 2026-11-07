import { describe, expect, it } from 'vitest'
import { isFullScreenToggle } from '../../src/main/fullScreen'

const key = { type: 'keyDown', key: 'F11', alt: false, control: false, shift: false, meta: false }

describe('isFullScreenToggle', () => {
  it('takes F11 pressed alone', () => {
    expect(isFullScreenToggle(key)).toBe(true)
  })

  it('leaves its release, other keys and F11 with a modifier', () => {
    expect(isFullScreenToggle({ ...key, type: 'keyUp' })).toBe(false)
    expect(isFullScreenToggle({ ...key, key: 'F10' })).toBe(false)
    expect(isFullScreenToggle({ ...key, control: true })).toBe(false)
    expect(isFullScreenToggle({ ...key, shift: true })).toBe(false)
  })
})

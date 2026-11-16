import { describe, expect, it } from 'vitest'
import { formatMessage } from '../../src/renderer/src/i18n/format'

describe('a message with its values', () => {
  it('puts each value in its place, and leaves a value not given as it was', () => {
    expect(formatMessage('{count} · {size}', 'en', { count: 2, size: '35 MB' })).toBe('2 · 35 MB')
    expect(formatMessage('{count} · {size}', 'en', { count: 2 })).toBe('2 · {size}')
  })

  it('takes the word for the number, as each language counts: French puts 0 and 1 in the singular, English 1 alone', () => {
    const text = '{count} {count|bot|bots}'
    expect(formatMessage(text, 'fr', { count: 0 })).toBe('0 bot')
    expect(formatMessage(text, 'fr', { count: 1 })).toBe('1 bot')
    expect(formatMessage(text, 'fr', { count: 2 })).toBe('2 bots')
    expect(formatMessage(text, 'en', { count: 0 })).toBe('0 bots')
    expect(formatMessage(text, 'en', { count: 1 })).toBe('1 bot')
    expect(formatMessage('{count} {count|Élyséen|Élyséens}, {present} {present|présent|présents}', 'fr', { count: 1, present: 3 })).toBe('1 Élyséen, 3 présents')
  })
})

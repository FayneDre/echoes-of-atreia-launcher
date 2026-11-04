import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let dir: string

// The store asks Electron where the profile folder is; here it is a temporary one.
vi.mock('electron', () => ({ app: { getPath: () => dir } }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'echoes-store-'))
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('SettingsStore', () => {
  it('keeps every change when several are asked at once', async () => {
    const { SettingsStore } = await import('../../src/main/settings')
    const store = new SettingsStore()
    await store.load()

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.update((settings) => ({ ...settings, selectedCharacters: { ...settings.selectedCharacters, [`account${index}`]: index } }))
      )
    )

    const written = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'))
    expect(Object.keys(written.selectedCharacters)).toHaveLength(20)
    expect(store.current.selectedCharacters).toEqual(written.selectedCharacters)
  })
})

import { describe, expect, it } from 'vitest'
import { isInstalled } from '../../src/renderer/src/installedRelease'

describe('the release installed', () => {
  it('is the one of its source whose tag is the version installed, written with its v or without', () => {
    const installed = { launcher: '0.3.0-beta.13', server: 'v0.1.0-beta.8' }
    expect(isInstalled({ source: 'launcher', tag: 'v0.3.0-beta.13' }, installed)).toBe(true)
    expect(isInstalled({ source: 'server', tag: 'v0.1.0-beta.8' }, installed)).toBe(true)
    expect(isInstalled({ source: 'launcher', tag: 'v0.3.0-beta.14' }, installed)).toBe(false)
    // the same number in the other source is another program's release
    expect(isInstalled({ source: 'server', tag: 'v0.3.0-beta.13' }, installed)).toBe(false)
    // a development server or a run from the sources has no release
    expect(isInstalled({ source: 'server', tag: 'v0.1.0-beta.8' }, { server: null })).toBe(false)
  })
})

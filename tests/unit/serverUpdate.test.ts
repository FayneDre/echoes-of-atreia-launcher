import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isSafePath, matchesRule, parseReleaseManifest, readInstallOrigin } from '../../src/main/serverUpdate/manifest'
import { compareVersions } from '../../src/shared/types'

const HASH = 'a'.repeat(64)

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    source: 'release',
    version: 'v0.1.0-beta.2',
    revision: 'abc1234',
    apiLevel: 1,
    java: 25,
    rules: { prune: ['game-server/libs/'], local: ['game-server/config/'] },
    files: { 'game-server/libs/a.jar': HASH },
    navmesh: { 'game-server/data/navmesh/1.nav': { sha256: HASH, size: 3, release: 'v0.1.0-beta.2', asset: 'navmesh-1.nav.gz' } },
    ...overrides
  })
}

describe('compareVersions', () => {
  it('orders as semantic versioning does, a beta before its release', () => {
    expect(compareVersions('v0.1.0-beta.2', 'v0.1.0-beta.10')).toBe(-1)
    expect(compareVersions('v0.1.0', 'v0.1.0-beta.9')).toBe(1)
    expect(compareVersions('0.2.0', 'v0.2.0')).toBe(0)
    expect(compareVersions('v1.0.0', 'v0.9.9')).toBe(1)
  })
  it('does not order what is not a version', () => {
    expect(compareVersions('dev', 'v0.1.0')).toBeNull()
  })
})

describe('parseReleaseManifest', () => {
  it('reads what package-release.ps1 writes', () => {
    expect(parseReleaseManifest(manifest())?.files['game-server/libs/a.jar']).toBe(HASH)
  })
  it('refuses a manifest naming a path out of the install, or a hash that is not one', () => {
    expect(parseReleaseManifest(manifest({ files: { '../outside.jar': HASH } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ files: { 'C:/Windows/x.dll': HASH } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ files: { 'game-server\\libs\\a.jar': HASH } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ files: { 'game-server/libs/a.jar': 'not a hash' } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ navmesh: { 'x.nav': { sha256: HASH, size: 1, release: 'v1', asset: '../x' } } }))).toBeNull()
  })
  it('refuses what is not a release manifest', () => {
    expect(parseReleaseManifest(manifest({ source: 'deploy' }))).toBeNull()
    expect(parseReleaseManifest('{ not json')).toBeNull()
  })
})

describe('paths and rules', () => {
  it('takes a rule ending in / for a folder, any other for one file', () => {
    expect(matchesRule('game-server/config/main/rates.properties', ['game-server/config/'])).toBe(true)
    expect(matchesRule('game-server/start.bat', ['game-server/start.bat'])).toBe(true)
    expect(matchesRule('game-server/start.bat.old', ['game-server/start.bat'])).toBe(false)
  })
  it('knows a safe path', () => {
    expect(isSafePath('game-server/libs/a.jar')).toBe(true)
    expect(isSafePath('/etc/passwd')).toBe(false)
    expect(isSafePath('a//b')).toBe(false)
  })
})

describe('readInstallOrigin', () => {
  let dir: string | null = null
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
      dir = null
    }
  })
  it('tells a server built from git, a development install and a release apart', async () => {
    dir = await mkdtemp(join(tmpdir(), 'echoes-origin-'))
    expect(await readInstallOrigin(dir)).toEqual({ source: 'none' })
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ source: 'deploy', version: 'dev', revision: 'c979e97', apiLevel: 1 }))
    expect(await readInstallOrigin(dir)).toEqual({ source: 'deploy', revision: 'c979e97' })
    await writeFile(join(dir, 'manifest.json'), manifest())
    expect(await readInstallOrigin(dir)).toMatchObject({ source: 'release', manifest: { version: 'v0.1.0-beta.2' } })
  })
  it('never takes a manifest it cannot read for no manifest: that install is left alone', async () => {
    dir = await mkdtemp(join(tmpdir(), 'echoes-origin-'))
    await writeFile(join(dir, 'manifest.json'), '{ broken')
    expect(await readInstallOrigin(dir)).toEqual({ source: 'deploy', revision: null })
  })
})

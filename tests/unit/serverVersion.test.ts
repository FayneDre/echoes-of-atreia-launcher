import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseVersionAnswer, readInstallManifest } from '../../src/main/server/serverVersion'
import { MIN_SERVER_API_LEVEL, isBetaVersion, isServerTooOld } from '../../src/shared/types'

describe('parseVersionAnswer', () => {
  it('reads one key and value a line', () => {
    expect(parseVersionAnswer({ ok: true, lines: ['version v0.1.0-beta.1', 'revision abc1234', 'api 1'] })).toEqual({
      from: 'server',
      version: 'v0.1.0-beta.1',
      revision: 'abc1234',
      apiLevel: 1
    })
  })
  it('takes a server that does not know the request, or does not answer, for level 0', () => {
    expect(parseVersionAnswer({ ok: false, error: 'unknown command version' }).apiLevel).toBe(0)
    expect(parseVersionAnswer({ ok: false, error: 'no answer' }).apiLevel).toBe(0)
  })
  it('takes a level it cannot read for 0', () => {
    expect(parseVersionAnswer({ ok: true, lines: ['version dev', 'api many'] }).apiLevel).toBe(0)
  })
})

describe('readInstallManifest', () => {
  let dir: string | null = null
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
      dir = null
    }
  })
  it('reads what the deploy script wrote', async () => {
    dir = await mkdtemp(join(tmpdir(), 'echoes-manifest-'))
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ source: 'deploy', version: 'dev', revision: 'abc1234', apiLevel: 1 }))
    expect(await readInstallManifest(dir)).toEqual({ from: 'manifest', version: 'dev', revision: 'abc1234', apiLevel: 1 })
  })
  it('knows nothing without a manifest, or with one it cannot read', async () => {
    dir = await mkdtemp(join(tmpdir(), 'echoes-manifest-'))
    expect(await readInstallManifest(dir)).toBeNull()
    await writeFile(join(dir, 'manifest.json'), '{ not json')
    expect(await readInstallManifest(dir)).toBeNull()
  })
})

describe('isServerTooOld', () => {
  it('says so only of a server known to be below the level', () => {
    expect(isServerTooOld(null)).toBe(false)
    expect(isServerTooOld({ from: 'server', version: null, revision: null, apiLevel: MIN_SERVER_API_LEVEL - 1 })).toBe(true)
    expect(isServerTooOld({ from: 'manifest', version: 'dev', revision: null, apiLevel: MIN_SERVER_API_LEVEL })).toBe(false)
  })
})

describe('isBetaVersion', () => {
  it('follows the pre-releases only for a version with a pre-release part', () => {
    expect(isBetaVersion('0.3.0-beta.2')).toBe(true)
    expect(isBetaVersion('0.3.0')).toBe(false)
  })
})

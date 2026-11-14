import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runtimesOf } from '../../src/main/serverUpdate/installer'
import { isSafePath, matchesRule, parseReleaseManifest, readInstallOrigin } from '../../src/main/serverUpdate/manifest'
import { SERVER_FOLDER_NAME, serverFolderIn } from '../../src/main/serverUpdate/serverSetup'
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

describe('the runtimes of a release', () => {
  const java = { version: '25.0.4.1', target: 'runtime', sha256: HASH, size: 9, release: 'v0.1.0-beta.5', asset: 'runtime-java-25.0.4.1.zip' }
  const mysql = { version: '26.7.0', target: 'mysql', sha256: HASH, size: 8, release: 'v0.1.0-beta.5', asset: 'runtime-mysql-26.7.0.zip' }
  it('reads the Java and the MySQL an install from nothing unpacks, and a manifest made before them', () => {
    expect(parseReleaseManifest(manifest({ runtimes: { java, mysql } }))?.runtimes?.mysql?.target).toBe('mysql')
    expect(parseReleaseManifest(manifest())?.runtimes).toBeUndefined()
  })
  it('refuses a runtime unpacked anywhere but its own folder, or one it does not know', () => {
    expect(parseReleaseManifest(manifest({ runtimes: { java: { ...java, target: 'game-server/libs' } } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ runtimes: { java: { ...java, target: 'mysql' } } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ runtimes: { java: { ...java, asset: '../x.zip' } } }))).toBeNull()
    expect(parseReleaseManifest(manifest({ runtimes: { python: java } }))).toBeNull()
  })
  it('tells a release that cannot make an install', () => {
    expect(runtimesOf(parseReleaseManifest(manifest({ runtimes: { java, mysql } }))!).map((entry) => entry.target)).toEqual(['runtime', 'mysql'])
    expect(() => runtimesOf(parseReleaseManifest(manifest({ runtimes: { java } }))!)).toThrow()
  })
})

describe('the folder an install from nothing goes into', () => {
  let dir: string | null = null
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true })
      dir = null
    }
  })
  it('is the folder chosen when it is empty or missing, else a new one inside it', async () => {
    dir = await mkdtemp(join(tmpdir(), 'echoes-setup-'))
    expect(await serverFolderIn(dir)).toEqual({ folder: dir, filesInPlace: false })
    expect(await serverFolderIn(join(dir, 'new'))).toEqual({ folder: join(dir, 'new'), filesInPlace: false })
    await writeFile(join(dir, 'notes.txt'), 'the person’s')
    expect(await serverFolderIn(dir)).toEqual({ folder: join(dir, SERVER_FOLDER_NAME), filesInPlace: false })
    // a try that stopped while it put the files in place is taken up where it is
    await mkdir(join(dir, 'update-staging'))
    expect(await serverFolderIn(dir)).toEqual({ folder: dir, filesInPlace: false })
    await rm(join(dir, 'update-staging'), { recursive: true })
    await mkdir(join(dir, SERVER_FOLDER_NAME))
    await writeFile(join(dir, SERVER_FOLDER_NAME, 'other.txt'), 'something else')
    expect(await serverFolderIn(dir)).toBeNull()
  })
  it('is taken up at the database when an earlier try put the files and stopped there', async () => {
    dir = await mkdtemp(join(tmpdir(), 'echoes-setup-'))
    await writeFile(join(dir, 'manifest.json'), manifest())
    await mkdir(join(dir, 'mysql', 'bin'), { recursive: true })
    await writeFile(join(dir, 'mysql', 'bin', 'mysqld.exe'), '')
    expect(await serverFolderIn(dir)).toEqual({ folder: dir, filesInPlace: true })
    // made already: an install, not one to take up
    await writeFile(join(dir, 'mysql', 'my.ini'), '[mysqld]\n')
    expect(await serverFolderIn(dir)).toEqual({ folder: join(dir, SERVER_FOLDER_NAME), filesInPlace: false })
  })
})

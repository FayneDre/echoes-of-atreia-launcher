import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { INSTALL_MARKER, isInside, isLauncherInstall, writeInstallMarker } from '../../src/main/serverUpdate/installMarker'

describe('installMarker', () => {
  const made: string[] = []
  const folder = (): string => {
    const path = mkdtempSync(join(tmpdir(), 'echoes-marker-'))
    made.push(path)
    return path
  }
  afterEach(() => {
    for (const path of made.splice(0)) {
      rmSync(path, { recursive: true, force: true })
    }
  })

  it('knows a folder the launcher installed, in a new folder it makes', async () => {
    const server = join(folder(), 'echoes-server')
    await writeInstallMarker(server)
    expect(await isLauncherInstall(server)).toBe(true)
    expect(await isLauncherInstall(server.toUpperCase())).toBe(process.platform === 'win32')
  })

  it('takes no folder without the marker, with a marker of another kind, or none at all', async () => {
    const server = folder()
    expect(await isLauncherInstall(server)).toBe(false)
    expect(await isLauncherInstall(null)).toBe(false)
    writeFileSync(join(server, INSTALL_MARKER), JSON.stringify({ installedBy: 'someone else', folder: server }))
    expect(await isLauncherInstall(server)).toBe(false)
    writeFileSync(join(server, INSTALL_MARKER), 'not json')
    expect(await isLauncherInstall(server)).toBe(false)
  })

  it('takes no copy of an install moved elsewhere: its marker names the first folder', async () => {
    const server = folder()
    await writeInstallMarker(server)
    const copy = join(folder(), 'copy')
    cpSync(server, copy, { recursive: true })
    expect(await isLauncherInstall(copy)).toBe(false)
  })

  it('tells a path inside a folder from one beside it or on another drive', () => {
    expect(isInside('C:\\Aion Server', 'C:\\Aion Server')).toBe(true)
    expect(isInside('C:\\Aion Server', 'C:\\Aion Server\\mysql\\my.ini')).toBe(true)
    expect(isInside('C:\\Aion Server', 'C:\\Aion Server 2\\backups')).toBe(false)
    expect(isInside('C:\\Aion Server', 'C:\\Users\\me\\Documents')).toBe(false)
    if (process.platform === 'win32') {
      expect(isInside('C:\\Aion Server', 'D:\\Aion Server\\backups')).toBe(false)
    }
  })
})

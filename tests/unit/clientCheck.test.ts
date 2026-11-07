import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkClient, clientLanguageFor } from '../../src/main/clientCheck'
import type { ClientLanguagePack } from '../../src/shared/types'

describe('the client check', () => {
  let root: string

  async function file(path: string): Promise<void> {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), '')
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'echoes-client-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads the packs of L10N as the 4.8 NA client with a French pack of another build has them', async () => {
    for (const path of ['bin64/aion.bin', 'bin64/crysystem.dll', 'bin64/Cry3DEngine.dll', 'bin64/XRenderD3D9.dll', 'Data/Data.pak']) {
      await file(path)
    }
    // the English pack the client ships, in lower case
    for (const path of ['enu.pak', 'data/data.pak', 'data/cutscene/movie/aion_4.8_intro.bik', 'sounds/cutscene/df5/df5.pak', 'sounds/cutscene/lf5/lf5.pak']) {
      await file(`L10N/enu/${path}`)
    }
    // a French pack of another build: its own intro, without the 4.8 one nor the two cutscene sounds
    for (const path of ['fra.pak', 'Data/Data.pak', 'Data/CutScene/movie/mv_f5_intro.bik']) {
      await file(`L10N/FRA/${path}`)
    }
    // a German pack without its deu.pak, and a folder the client does not know
    await file('L10N/DEU/Data/Data.pak')
    await file('L10N/backup/fra.pak')

    expect(await checkClient(root)).toEqual({
      missing: [],
      packs: [
        { code: 'FRA', complete: true, missingFiles: 3 },
        { code: 'ENU', complete: true, missingFiles: 0 },
        { code: 'DEU', complete: false, missingFiles: 3 }
      ]
    })
  })

  it('names what the client cannot start without', async () => {
    await file('bin64/aion.bin')
    expect((await checkClient(root)).missing).toEqual(['bin64/crysystem.dll', 'bin64/Cry3DEngine.dll', 'bin64/XRenderD3D9.dll', 'Data'])
  })
})

describe('the client language', () => {
  const packs: ClientLanguagePack[] = [
    { code: 'FRA', complete: true, missingFiles: 3 },
    { code: 'ENU', complete: true, missingFiles: 0 },
    { code: 'DEU', complete: false, missingFiles: 4 }
  ]

  it('follows the interface until the person chooses, and never picks an incomplete pack', () => {
    expect(clientLanguageFor(packs, undefined, 'fr')).toBe('FRA')
    expect(clientLanguageFor(packs, undefined, 'en')).toBe('ENU')
    expect(clientLanguageFor(packs, 'ENU', 'fr')).toBe('ENU')
    expect(clientLanguageFor(packs, 'DEU', 'fr')).toBe('FRA')
  })

  it('takes the first complete pack when the interface’s is not there, and none when no pack is complete', () => {
    expect(clientLanguageFor([{ code: 'DEU', complete: true, missingFiles: 0 }], undefined, 'fr')).toBe('DEU')
    expect(clientLanguageFor([{ code: 'DEU', complete: false, missingFiles: 0 }], undefined, 'fr')).toBeNull()
  })
})

import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { CLIENT_LANGUAGE_CODES, type ClientLanguageCode, type ClientLanguagePack } from '../shared/types'

/**
 * What the client cannot start without: its executable and the engine's main libraries, beside its shared data. Checked by name: a file of
 * the right name and size zero is the end-to-end tests' stand-in, and a damaged file is beyond what a launcher can tell.
 */
const REQUIRED_FILES = ['bin64/aion.bin', 'bin64/crysystem.dll', 'bin64/Cry3DEngine.dll', 'bin64/XRenderD3D9.dll']
const REQUIRED_FOLDERS = ['Data']

export interface ClientCheck {
  /** The required files and folders not found, as paths relative to the client's folder. */
  missing: string[]
  packs: ClientLanguagePack[]
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Every file under a folder, as lower-case paths relative to it: the packs write the same folders in different cases (`data`, `Data`). */
async function filesUnder(folder: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (current: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else {
        found.push(relative(folder, path).replace(/\\/g, '/').toLowerCase())
      }
    }
  }
  await walk(folder)
  return found
}

/**
 * The language packs of a client: each folder of `L10N` named after a code the client knows. The client reads `L10N/<code>` for the code
 * given as `-lang:<code>` (the strings of `aion.bin` and `crysystem.dll`), and that folder holds `<code>.pak` (`L10N/enu/enu.pak`) and
 * `Data/Data.pak`: a pack is complete with both. Against the English pack the client was shipped with, the files a pack lacks are counted: a French
 * pack taken from another build of the game lacks the 4.8 intro and two cutscene sound archives, which leaves those cutscenes silent.
 */
export async function findLanguagePacks(clientRoot: string): Promise<ClientLanguagePack[]> {
  const l10n = join(clientRoot, 'L10N')
  let entries
  try {
    entries = await readdir(l10n, { withFileTypes: true })
  } catch {
    return []
  }
  const packs: { code: ClientLanguageCode; files: string[] }[] = []
  for (const entry of entries) {
    const code = entry.name.toUpperCase() as ClientLanguageCode
    if (entry.isDirectory() && CLIENT_LANGUAGE_CODES.includes(code)) {
      packs.push({ code, files: await filesUnder(join(l10n, entry.name)) })
    }
  }
  const ownPak = (code: ClientLanguageCode): string => `${code.toLowerCase()}.pak`
  const reference = packs.find((pack) => pack.code === 'ENU') ?? packs.find((pack) => pack.code === 'ENG')
  return packs
    .map(({ code, files }) => {
      const present = new Set(files)
      const missingFiles = reference && reference.code !== code
        ? reference.files.filter((file) => file !== ownPak(reference.code) && !present.has(file)).length
        : 0
      return { code, complete: present.has(ownPak(code)) && present.has('data/data.pak'), missingFiles }
    })
    .sort((a, b) => CLIENT_LANGUAGE_CODES.indexOf(a.code) - CLIENT_LANGUAGE_CODES.indexOf(b.code))
}

/** Whether a client folder holds what the client needs to start, and which languages it can start in. */
export async function checkClient(clientRoot: string): Promise<ClientCheck> {
  const missing: string[] = []
  for (const path of [...REQUIRED_FILES, ...REQUIRED_FOLDERS]) {
    if (!(await exists(join(clientRoot, path)))) {
      missing.push(path)
    }
  }
  return { missing, packs: await findLanguagePacks(clientRoot) }
}

/**
 * The language the client starts in: the one the person chose while its pack is complete; else the interface's own (French for French,
 * English for English); else the first complete pack. Null when no pack is complete.
 */
export function clientLanguageFor(
  packs: ClientLanguagePack[],
  chosen: string | undefined,
  interfaceLanguage: 'fr' | 'en'
): ClientLanguageCode | null {
  const complete = packs.filter((pack) => pack.complete).map((pack) => pack.code)
  if (chosen && complete.includes(chosen as ClientLanguageCode)) {
    return chosen as ClientLanguageCode
  }
  const preferred: ClientLanguageCode[] = interfaceLanguage === 'fr' ? ['FRA'] : ['ENU', 'ENG']
  return preferred.find((code) => complete.includes(code)) ?? complete[0] ?? null
}

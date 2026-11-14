import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

/**
 * Written by an install from nothing into the folder it made (empty, or new): the one proof that the launcher may delete that folder whole.
 * A server built from git, or one an update installed over, has none, and the launcher never offers to uninstall it.
 */
export const INSTALL_MARKER = 'echoes-install.json'
const INSTALLED_BY = 'echoes-of-atreia-launcher'

interface Marker {
  installedBy: string
  /** The folder it was written in: a folder copied or moved elsewhere carries the marker of another place. */
  folder: string
  installedAt: string
}

function samePath(a: string, b: string): boolean {
  const left = resolve(a)
  const right = resolve(b)
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

export async function writeInstallMarker(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true })
  const marker: Marker = { installedBy: INSTALLED_BY, folder: resolve(folder), installedAt: new Date().toISOString() }
  await writeFile(join(folder, INSTALL_MARKER), JSON.stringify(marker, null, 2), 'utf8')
}

/** Whether a path is the folder or lies under it (on another drive, `relative` gives an absolute path: outside). */
export function isInside(folder: string, path: string): boolean {
  const inside = relative(folder, path)
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))
}

/** Whether the launcher installed this folder from nothing, here: its marker, naming this very folder. */
export async function isLauncherInstall(folder: string | null): Promise<boolean> {
  if (!folder) {
    return false
  }
  try {
    const marker = JSON.parse(await readFile(join(folder, INSTALL_MARKER), 'utf8')) as Partial<Marker>
    return marker.installedBy === INSTALLED_BY && typeof marker.folder === 'string' && samePath(marker.folder, folder)
  } catch {
    return false
  }
}

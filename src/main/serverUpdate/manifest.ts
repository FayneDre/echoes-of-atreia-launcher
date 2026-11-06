import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** A navmesh file of a release: its hash, and the release whose assets carry it (maps are attached only to the release that rebuilt them). */
export interface NavmeshEntry {
  sha256: string
  size: number
  release: string
  asset: string
}

/**
 * What the server's `tools/package-release.ps1` writes: the release, the hash of every file of its bundle, the rules of the install, and the
 * navmesh. The copy attached to the release names the bundle too; the one written into the install after an update does not.
 */
export interface ReleaseManifest {
  source: 'release'
  version: string
  revision: string
  apiLevel: number
  /** The JDK the release needs: the game server compiles its handlers at every start, which a JRE cannot. */
  java: number
  rules: {
    /** Folders that hold only what the bundle lists: a stale jar stays on the classpath, a removed handler is still compiled. */
    prune: string[]
    /** Files, or folders ending in `/`, that are the person's to edit. */
    local: string[]
  }
  /** Path (forward slashes, from the install's root) to SHA-256. */
  files: Record<string, string>
  navmesh: Record<string, NavmeshEntry>
  bundle?: { name: string; sha256: string; size: number }
}

const SHA256 = /^[0-9a-f]{64}$/

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** A path the manifest may name: relative, forward slashes, no way out of the install. */
export function isSafePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') && !/^[A-Za-z]:/.test(path) && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

/** The manifest if it is one, else null: it decides which files are written where, so anything off is refused whole. */
export function parseReleaseManifest(text: string): ReleaseManifest | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const manifest = value as Record<string, unknown>
  const rules = manifest['rules'] as Record<string, unknown> | undefined
  const files = manifest['files'] as Record<string, unknown> | undefined
  const navmesh = manifest['navmesh'] as Record<string, unknown> | undefined
  if (
    manifest['source'] !== 'release' ||
    typeof manifest['version'] !== 'string' ||
    typeof manifest['revision'] !== 'string' ||
    !Number.isInteger(manifest['apiLevel']) ||
    !Number.isInteger(manifest['java']) ||
    typeof rules !== 'object' ||
    rules === null ||
    !isStringArray(rules['prune']) ||
    !isStringArray(rules['local']) ||
    typeof files !== 'object' ||
    files === null ||
    typeof navmesh !== 'object' ||
    navmesh === null
  ) {
    return null
  }
  for (const [path, hash] of Object.entries(files)) {
    if (!isSafePath(path) || typeof hash !== 'string' || !SHA256.test(hash)) {
      return null
    }
  }
  for (const [path, entry] of Object.entries(navmesh)) {
    const { sha256, size, release, asset } = (entry ?? {}) as Record<string, unknown>
    if (!isSafePath(path) || typeof sha256 !== 'string' || !SHA256.test(sha256) || !Number.isInteger(size) || typeof release !== 'string' || typeof asset !== 'string' || !isSafePath(asset)) {
      return null
    }
  }
  const bundle = manifest['bundle'] as Record<string, unknown> | undefined
  if (bundle !== undefined && (typeof bundle['name'] !== 'string' || typeof bundle['sha256'] !== 'string' || !SHA256.test(bundle['sha256']) || !Number.isInteger(bundle['size']))) {
    return null
  }
  return value as ReleaseManifest
}

/**
 * What the install's `manifest.json` says of where it comes from: `deploy` (the server's deploy script: a development install, never updated
 * from a release), `release` (installed from a bundle, with that bundle's manifest), or none at all (a server built from git, which the first
 * update installs over).
 */
export type InstallOrigin = { source: 'none' } | { source: 'deploy'; revision: string | null } | { source: 'release'; manifest: ReleaseManifest }

export async function readInstallOrigin(serverRoot: string): Promise<InstallOrigin> {
  let text: string
  try {
    text = await readFile(join(serverRoot, 'manifest.json'), 'utf8')
  } catch {
    return { source: 'none' }
  }
  const release = parseReleaseManifest(text)
  if (release) {
    return { source: 'release', manifest: release }
  }
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    if (value['source'] === 'deploy') {
      return { source: 'deploy', revision: typeof value['revision'] === 'string' ? value['revision'] : null }
    }
  } catch {
    // unreadable: taken for a development install below, the safe side
  }
  // A manifest the launcher cannot read is not overwritten as if there were none.
  return { source: 'deploy', revision: null }
}

/** Whether a path falls under one of the rules: a folder ending in `/`, or the file itself. */
export function matchesRule(path: string, rules: string[]): boolean {
  return rules.some((rule) => (rule.endsWith('/') ? path.startsWith(rule) : path === rule))
}

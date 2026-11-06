import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ServerVersion } from '../../shared/types'
import type { AdminAnswer } from './adminChannel'

/**
 * The running game server's answer to `version`: one `key value` line each (version, revision, api). Any failure is level 0: a server that
 * does not know the request answers "unknown command", and one from before the admin channel does not answer at all.
 */
export function parseVersionAnswer(answer: AdminAnswer): ServerVersion {
  if (!answer.ok) {
    return { from: 'server', version: null, revision: null, apiLevel: 0 }
  }
  const values = new Map<string, string>()
  for (const line of answer.lines) {
    const space = line.indexOf(' ')
    if (space > 0) {
      values.set(line.slice(0, space), line.slice(space + 1).trim())
    }
  }
  const level = Number(values.get('api'))
  return {
    from: 'server',
    version: values.get('version') || null,
    revision: values.get('revision') || null,
    apiLevel: Number.isInteger(level) && level >= 0 ? level : 0
  }
}

/**
 * What the install's `manifest.json` says, written by the server's deploy script (and by a release bundle): what the launcher knows of a
 * stopped server. Null when there is none, or it cannot be read: then nothing is known, which is not the same as too old.
 */
export async function readInstallManifest(serverRoot: string): Promise<ServerVersion | null> {
  let manifest: unknown
  try {
    manifest = JSON.parse(await readFile(join(serverRoot, 'manifest.json'), 'utf8'))
  } catch {
    return null
  }
  if (typeof manifest !== 'object' || manifest === null) {
    return null
  }
  const { version, revision, apiLevel } = manifest as Record<string, unknown>
  return {
    from: 'manifest',
    version: typeof version === 'string' && version ? version : null,
    revision: typeof revision === 'string' && revision ? revision : null,
    apiLevel: typeof apiLevel === 'number' && Number.isInteger(apiLevel) && apiLevel >= 0 ? apiLevel : 0
  }
}

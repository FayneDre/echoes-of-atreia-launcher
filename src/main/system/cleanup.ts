import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { SERVER_IDS, type CleanupResult } from '../../shared/types'
import type { ServerLayout } from '../server/installation'

export interface CleanupRules {
  /** An archived log older than this many days goes. */
  archiveDays: number
  /** Beyond it, the three servers' archives together lose their oldest until they fit. */
  archiveBytes: number
  /** The problem reports kept, the newest. */
  reportsKept: number
}

/**
 * A month of archives: the game server rolls its console log into `log/archived/<from> to <to>.zip` and a tester's `//bot note` is read
 * back from there (about 160 MB for ten days of tests). A gigabyte at most whatever the month held.
 */
export const CLEANUP_RULES: CleanupRules = { archiveDays: 30, archiveBytes: 1024 ** 3, reportsKept: 10 }

interface Candidate {
  path: string
  bytes: number
  modified: number
}

async function zipsIn(folder: string, pattern: RegExp): Promise<Candidate[]> {
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return []
  }
  const found: Candidate[] = []
  for (const name of names.filter((candidate) => pattern.test(candidate))) {
    try {
      const info = await stat(join(folder, name))
      if (info.isFile()) {
        found.push({ path: join(folder, name), bytes: info.size, modified: info.mtimeMs })
      }
    } catch {
      // gone in between
    }
  }
  return found
}

/**
 * What piles up and nothing reads after a while: the servers' archived logs and the problem reports. The current logs, the backups, the
 * measurements and the server update's own files are never touched. A file that cannot be removed (open in another program) is left for
 * the next start.
 */
export async function cleanUp(layout: ServerLayout, now = Date.now(), rules = CLEANUP_RULES): Promise<CleanupResult> {
  const doomed: Candidate[] = []
  const archives = (
    await Promise.all(SERVER_IDS.map((id) => zipsIn(join(layout.servers[id].dir, 'log', 'archived'), /\.zip$/i)))
  ).flat()
  const oldest = now - rules.archiveDays * 24 * 60 * 60 * 1000
  let kept = 0
  // newest first: what the budget keeps is the most recent
  for (const archive of archives.sort((a, b) => b.modified - a.modified)) {
    if (archive.modified < oldest || kept + archive.bytes > rules.archiveBytes) {
      doomed.push(archive)
    } else {
      kept += archive.bytes
    }
  }
  const reports = (await zipsIn(join(layout.root, 'reports'), /^report-.*\.zip$/i)).sort((a, b) => b.modified - a.modified)
  doomed.push(...reports.slice(rules.reportsKept))

  const result: CleanupResult = { files: 0, bytes: 0 }
  for (const file of doomed) {
    try {
      await rm(file.path)
      result.files++
      result.bytes += file.bytes
    } catch {
      // still open somewhere: next time
    }
  }
  return result
}

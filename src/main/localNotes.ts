import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { compareVersions, type NewsItem, type NewsSource } from '../shared/types'

/** Where each repository keeps its notes, French first, the English twin beside it with the same version headings. */
const NOTES_FOLDER: Record<NewsSource, string> = { launcher: 'docs/release-notes', server: 'docs/patch-notes' }

export interface NotesEntry {
  tag: string
  /** The date of the heading, as ISO 8601 when it reads as one (the English file writes 2026-11-06, the French 06/11/2026). */
  date: string | null
  body: string
}

/**
 * The entries of a notes file: each `## <version> — <date>` heading and what follows it, up to the next heading or the `---` closing it.
 * Headings that are not a version (a patch named by its date) are left out: the news shows versions.
 */
export function parseNotesFile(text: string): NotesEntry[] {
  const entries: NotesEntry[] = []
  const lines = text.split(/\r?\n/)
  let current: { tag: string; date: string | null; lines: string[] } | null = null
  const close = (): void => {
    if (current) {
      const body = current.lines.join('\n').replace(/\n---\s*$/, '').trim()
      entries.push({ tag: current.tag, date: current.date, body })
    }
  }
  for (const line of lines) {
    const heading = line.match(/^## (\S+)(?:\s+—\s+(.+))?$/)
    if (heading) {
      close()
      const tag = heading[1]!
      current = compareVersions(tag, '0.0.0') === null ? null : { tag, date: isoDate(heading[2] ?? ''), lines: [] }
      continue
    }
    current?.lines.push(line)
  }
  close()
  return entries
}

function isoDate(text: string): string | null {
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`
  }
  const french = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return french ? `${french[3]}-${french[2]}-${french[1]}T12:00:00Z` : null
}

/**
 * The news of a repository on this computer, for the developer mode: its notes files instead of its GitHub releases. The newest first, as
 * many as `kept`. An entry links to the release it would be on GitHub. Nothing when the folder is not there.
 */
export async function readLocalNews(source: NewsSource, repository: string | null, gitHubName: string, kept: number): Promise<NewsItem[]> {
  if (!repository) {
    return []
  }
  const read = async (file: string): Promise<NotesEntry[]> => {
    try {
      return parseNotesFile(await readFile(join(repository, NOTES_FOLDER[source], file), 'utf8'))
    } catch {
      return []
    }
  }
  const [french, english] = await Promise.all([read('current.md'), read('current.en.md')])
  const tags = [...new Set([...english, ...french].map((entry) => entry.tag))]
    .sort((a, b) => compareVersions(b, a) ?? 0)
    .slice(0, kept)
  return tags.map((tag) => {
    const en = english.find((entry) => entry.tag === tag)
    const fr = french.find((entry) => entry.tag === tag)
    return {
      source,
      tag,
      prerelease: tag.includes('-'),
      date: en?.date ?? fr?.date ?? null,
      url: `https://github.com/${gitHubName}/releases/tag/${tag}`,
      notes: { ...(en ? { en: en.body } : {}), ...(fr ? { fr: fr.body } : {}) }
    }
  })
}

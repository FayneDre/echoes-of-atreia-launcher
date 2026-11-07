import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Where GitHub's answers are kept between runs: the launcher's profile folder, set once at start. Unset (the unit tests of the code that
 * reads releases), nothing is kept and every question goes out.
 */
let cacheDir: string | null = null
/** An answer younger than this is used without asking: relaunching the launcher a few times costs nothing. */
let freshForMs = 0

export function setGithubCacheDir(dir: string | null, freshFor = 10 * 60 * 1000): void {
  cacheDir = dir
  freshForMs = freshFor
}

interface CacheEntry {
  url: string
  etag: string
  body: unknown
  /** When GitHub last gave or confirmed it (ms since the epoch). */
  checkedAt: number
}

/** How an answer came: from GitHub, from the copy kept because GitHub said nothing changed, or from that copy because GitHub refused. */
export type Freshness = 'fetched' | 'unchanged' | 'stale'

const fileFor = (dir: string, url: string): string => join(dir, `${createHash('sha256').update(url).digest('hex').slice(0, 24)}.json`)

async function readEntry(url: string): Promise<CacheEntry | null> {
  if (!cacheDir) {
    return null
  }
  try {
    const entry = JSON.parse(await readFile(fileFor(cacheDir, url), 'utf8')) as CacheEntry
    return entry.url === url ? entry : null
  } catch {
    return null
  }
}

async function writeEntry(entry: CacheEntry): Promise<void> {
  if (!cacheDir) {
    return
  }
  try {
    await mkdir(cacheDir, { recursive: true })
    const file = fileFor(cacheDir, entry.url)
    await writeFile(`${file}.tmp`, JSON.stringify(entry))
    await rename(`${file}.tmp`, file)
  } catch {
    // the next question goes out in full: nothing lost but a request
  }
}

/**
 * A JSON answer of GitHub's API, which answers 60 questions an hour to an address without an account, then refuses until the hour is over.
 * The last answer is kept on disk: younger than a few minutes, it is used without asking; older, the question carries its ETag
 * (`If-None-Match`), and a "304 nothing changed" spares downloading it again (it still counts against the 60 without an account: checked
 * on GitHub). When GitHub refuses (the hour's questions spent, no connection), the kept answer is given instead, so a page shows what it
 * showed last rather than an error. Throws only when it refuses and nothing was kept.
 */
export async function fetchGithubJson<T>(url: string): Promise<{ body: T; freshness: Freshness }> {
  const kept = await readEntry(url)
  if (kept && Date.now() - kept.checkedAt < freshForMs) {
    return { body: kept.body as T, freshness: 'unchanged' }
  }
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', ...(kept ? { 'If-None-Match': kept.etag } : {}) }
    })
  } catch (error) {
    if (kept) {
      return { body: kept.body as T, freshness: 'stale' }
    }
    throw error
  }
  if (response.status === 304 && kept) {
    await writeEntry({ ...kept, checkedAt: Date.now() })
    return { body: kept.body as T, freshness: 'unchanged' }
  }
  if (!response.ok) {
    if (kept) {
      return { body: kept.body as T, freshness: 'stale' }
    }
    throw new Error(`the releases answered ${response.status}`)
  }
  const body = (await response.json()) as T
  const etag = response.headers.get('etag')
  if (etag) {
    await writeEntry({ url, etag, body, checkedAt: Date.now() })
  }
  return { body, freshness: 'fetched' }
}

import { EventEmitter } from 'node:events'
import { compareVersions, type NewsItem, type NewsState, type NewsSource } from '../shared/types'
import { fetchGithubJson } from './github/cachedJson'
import { readLocalNews } from './localNotes'

const REPOSITORIES: Record<NewsSource, string> = {
  launcher: 'FayneDre/echoes-of-atreia-launcher',
  server: 'FayneDre/aion-server-playerbots'
}
const LANGUAGES = ['en', 'fr'] as const
/** How many releases of each repository the home page shows. */
const KEPT = 4

interface ReleaseListing {
  tag_name: string
  html_url: string
  published_at: string | null
  draft: boolean
  prerelease: boolean
  body: string | null
  assets: { name: string; browser_download_url: string }[]
}

/**
 * What changed in the launcher and the server: the last releases of each repository with their notes in both languages (the `notes.<lang>.md`
 * a release carries, else its body), for the home page. A beta launcher follows the pre-releases too, as its updates do. Read once, at the
 * launcher's start: the start is what shows what changed. In the developer mode, GitHub is not asked: the notes files of the two
 * repositories on this computer stand in (`localRepositories`). For the end-to-end tests, `ECHOES_NEWS_FEED` is a folder served over HTTP
 * holding `<source>.json` in GitHub's shape.
 */
export class NewsFeed extends EventEmitter<{ state: [NewsState] }> {
  private state: NewsState = { items: [] }
  /** What each source gave last: reused when GitHub says nothing changed, so the notes are not downloaded again. */
  private readonly last = new Map<NewsSource, NewsItem[]>()

  constructor(
    private readonly beta: boolean,
    /** The repositories whose notes stand in for GitHub in the developer mode, or null outside it. */
    private readonly localRepositories: () => Record<NewsSource, string | null> | null,
    private readonly base = process.env['ECHOES_NEWS_FEED'] ?? null
  ) {
    super()
  }

  get current(): NewsState {
    return this.state
  }

  start(): void {
    void this.refresh()
  }

  async refresh(): Promise<void> {
    const items: NewsItem[] = []
    let failed = false
    const local = this.localRepositories()
    for (const source of Object.keys(REPOSITORIES) as NewsSource[]) {
      try {
        items.push(...(local ? await readLocalNews(source, local[source], REPOSITORIES[source], KEPT) : await this.read(source)))
      } catch {
        failed = true
      }
    }
    items.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    this.state = { items, offline: failed && items.length === 0 }
    this.emit('state', this.state)
  }

  private async read(source: NewsSource): Promise<NewsItem[]> {
    const url = this.base ? `${this.base}/${source}.json` : `https://api.github.com/repos/${REPOSITORIES[source]}/releases?per_page=20`
    const { body, freshness } = await fetchGithubJson<ReleaseListing[]>(url)
    const known = this.last.get(source)
    if (freshness !== 'fetched' && known) {
      return known
    }
    const listing = body
      .filter((release) => !release.draft && (this.beta || !release.prerelease) && compareVersions(release.tag_name, '0.0.0') !== null)
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name)!)
      .slice(0, KEPT)
    const items: NewsItem[] = []
    for (const release of listing) {
      const notes: NewsItem['notes'] = {}
      for (const language of LANGUAGES) {
        const asset = release.assets.find((candidate) => candidate.name === `notes.${language}.md`)
        if (asset) {
          try {
            const answer = await fetch(asset.browser_download_url)
            if (answer.ok) {
              notes[language] = await answer.text()
            }
          } catch {
            // the body below stands in
          }
        }
      }
      if (!notes.en && !notes.fr && release.body) {
        // the body carries the French folded in a <details> block, which the page's Markdown does not draw: the English part alone
        notes.en = release.body.split('<details>')[0]!.trim()
      }
      items.push({ source, tag: release.tag_name, prerelease: release.prerelease, date: release.published_at, url: release.html_url, notes })
    }
    this.last.set(source, items)
    return items
  }
}

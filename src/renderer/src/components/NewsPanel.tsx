import { useEffect, useState } from 'react'
import type { NewsSource, NewsState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Markdown } from './Markdown'

const SOURCES: NewsSource[] = ['launcher', 'server']
const SEEN_KEY = 'news-seen'

/** The newest tag of each source the person has opened, kept in this browser only: a convenience, gone with its storage. */
function readSeen(): Partial<Record<NewsSource, string>> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Partial<Record<NewsSource, string>>
  } catch {
    return {}
  }
}

/**
 * What changed in the launcher and the server: a tab each, the newest release open with its notes in the person's language, the ones before
 * folded. A tab whose newest release has not been opened yet says "new".
 */
export function NewsPanel({ news }: { news: NewsState | null }): React.JSX.Element {
  const { language, t } = useI18n()
  const [source, setSource] = useState<NewsSource>('launcher')
  const [seen, setSeen] = useState(readSeen)
  const items = (news?.items ?? []).filter((item) => item.source === source)
  const newest = (of: NewsSource): string | undefined => news?.items.find((item) => item.source === of)?.tag

  // The tab shown counts as read.
  const shownNewest = newest(source)
  useEffect(() => {
    if (shownNewest && seen[source] !== shownNewest) {
      const next = { ...seen, [source]: shownNewest }
      setSeen(next)
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next))
      } catch {
        // the badge comes back next time
      }
    }
  }, [shownNewest, source, seen])

  return (
    <section className="panel news-panel" aria-labelledby="news-title" data-testid="news">
      <h2 id="news-title">{t('news.title')}</h2>
      <div className="tabs news-tabs" role="tablist">
        {SOURCES.map((id) => {
          const unread = newest(id) !== undefined && seen[id] !== newest(id) && id !== source
          return (
            <button key={id} type="button" role="tab" aria-selected={source === id} onClick={() => setSource(id)}>
              {t(`news.${id}`)}
              {unread && <span className="badge">{t('news.new')}</span>}
            </button>
          )
        })}
      </div>
      {news === null && <p className="muted">{t('news.loading')}</p>}
      {news?.offline && <p className="muted">{t('news.offline')}</p>}
      {news && !news.offline && items.length === 0 && <p className="muted">{t('news.none')}</p>}
      <div className="news-list">
        {items.map((item, index) => {
          const notes = item.notes[language] ?? item.notes.en ?? item.notes.fr
          const header = (
            <>
              <span className="news-tag">{item.tag}</span>
              {item.prerelease && <span className="tag tag-manual">{t('news.prerelease')}</span>}
              {item.date && <span className="news-date">{new Date(item.date).toLocaleDateString(language, { dateStyle: 'medium' })}</span>}
            </>
          )
          return (
            <details key={item.tag} className="news-item" open={index === 0} data-testid={`news-${item.source}-${item.tag}`}>
              <summary>{header}</summary>
              {notes ? <Markdown text={notes} /> : <p className="muted">{t('news.noNotes')}</p>}
              <a href={item.url} target="_blank" rel="noreferrer" className="news-link">
                {t('news.open')}
              </a>
            </details>
          )
        })}
      </div>
    </section>
  )
}

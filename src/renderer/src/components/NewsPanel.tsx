import { useEffect, useRef, useState } from 'react'
import type { NewsItem, NewsSource, NewsState } from '../../../shared/types'
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

/** The first paragraph of the notes, above their headings and lists: what the release is about, in a few lines. */
export function summaryOf(notes: string): string {
  for (const block of notes.split(/\r?\n\s*\r?\n/)) {
    const text = block.trim()
    if (text !== '' && !/^(#|[-*+] |\d+\. |```|>|<)/.test(text)) {
      return text
    }
  }
  return ''
}

/** A release's whole notes, over the page: closed by its button, Escape or a click beside it. */
function NotesDialog({ item, notes, onClose }: { item: NewsItem; notes: string | undefined; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="dialog news-dialog"
      aria-labelledby="news-dialog-title"
      data-testid="news-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) {
          dialog.current.close()
        }
      }}
    >
      <h2 id="news-dialog-title">
        {t(`news.${item.source}`)} {item.tag}
      </h2>
      <div className="news-dialog-body">{notes ? <Markdown text={notes} /> : <p className="muted">{t('news.noNotes')}</p>}</div>
      <div className="dialog-actions">
        <a href={item.url} target="_blank" rel="noreferrer" className="news-link">
          {t('news.open')}
        </a>
        <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
          {t('news.close')}
        </button>
      </div>
    </dialog>
  )
}

/**
 * What changed in the launcher and the server: a tab each, the newest release with a summary of its notes in the person's language, the
 * ones before on a line each; any of them opens its whole notes in a dialog. A tab whose newest release has not been opened yet says "new".
 */
export function NewsPanel({ news }: { news: NewsState | null }): React.JSX.Element {
  const { language, t } = useI18n()
  const [source, setSource] = useState<NewsSource>('launcher')
  const [seen, setSeen] = useState(readSeen)
  const [reading, setReading] = useState<NewsItem | null>(null)
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
          const summary = index === 0 && notes ? summaryOf(notes) : ''
          return (
            <article key={item.tag} className={index === 0 ? 'news-item news-latest' : 'news-item'} data-testid={`news-${item.source}-${item.tag}`}>
              <div className="news-head">
                <span className="news-tag">{item.tag}</span>
                {item.prerelease && <span className="tag tag-manual">{t('news.prerelease')}</span>}
                {item.date && <span className="news-date">{new Date(item.date).toLocaleDateString(language, { dateStyle: 'medium' })}</span>}
                <button type="button" className="link news-read" onClick={() => setReading(item)}>
                  {t('news.read')}
                </button>
              </div>
              {summary && (
                <div className="news-summary">
                  <Markdown text={summary} />
                </div>
              )}
            </article>
          )
        })}
      </div>
      {reading && (
        <NotesDialog item={reading} notes={reading.notes[language] ?? reading.notes.en ?? reading.notes.fr} onClose={() => setReading(null)} />
      )}
    </section>
  )
}

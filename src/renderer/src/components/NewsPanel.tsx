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

const notesOf = (item: NewsItem, language: string): string | undefined =>
  item.notes[language as keyof NewsItem['notes']] ?? item.notes.en ?? item.notes.fr

const dateOf = (item: NewsItem, language: string): string | null =>
  item.date ? new Date(item.date).toLocaleDateString(language, { dateStyle: 'medium' }) : null

/**
 * The whole notes of a tab's releases, over the page: the versions on the left, the notes of the one picked on the right. Closed by its
 * button, Escape or a click beside it.
 */
function NotesDialog({ items, first, onClose }: { items: NewsItem[]; first: number; onClose: () => void }): React.JSX.Element {
  const { language, t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const [picked, setPicked] = useState(first)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const item = items[picked] ?? items[0]!
  const notes = notesOf(item, language)
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
      <div className="news-dialog-main">
        {items.length > 1 && (
          <nav className="news-versions" aria-label={t('news.versions')}>
            {items.map((entry, index) => (
              <button key={entry.tag} type="button" aria-current={index === picked ? 'true' : undefined} onClick={() => setPicked(index)}>
                <span className="news-tag">{entry.tag}</span>
                <span className="news-date">{dateOf(entry, language)}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="news-dialog-body" key={item.tag}>
          {notes ? <Markdown text={notes} /> : <p className="muted">{t('news.noNotes')}</p>}
        </div>
      </div>
      <div className="dialog-actions">
        <a href={item.url} target="_blank" rel="noreferrer" className="news-link">
          {t('news.open')}
        </a>
        <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
          {t('action.close')}
        </button>
      </div>
    </dialog>
  )
}

/**
 * What changed in the launcher and the server: a tab each, showing its newest release alone, with a summary of its notes in the person's
 * language, so the panel keeps its height however many releases come out. The whole notes, and the releases before, open in a dialog. A
 * tab whose newest release has not been opened yet says "new".
 */
export function NewsPanel({ news }: { news: NewsState | null }): React.JSX.Element {
  const { language, t } = useI18n()
  const [source, setSource] = useState<NewsSource>('launcher')
  const [seen, setSeen] = useState(readSeen)
  const [reading, setReading] = useState<number | null>(null)
  const items = (news?.items ?? []).filter((item) => item.source === source)
  const latest = items[0]
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

  const notes = latest ? notesOf(latest, language) : undefined
  const summary = notes ? summaryOf(notes) : ''
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
      {latest && (
        <article className="news-item news-latest" data-testid={`news-${latest.source}-${latest.tag}`}>
          <div className="news-head">
            <span className="news-tag">{latest.tag}</span>
            {latest.prerelease && <span className="tag tag-manual">{t('news.prerelease')}</span>}
            <span className="news-date">{dateOf(latest, language)}</span>
          </div>
          {/* the room of four lines even when the summary is shorter or missing: switching tabs moves nothing */}
          <div className="news-summary" data-testid="news-summary">
            {summary && <Markdown text={summary} />}
          </div>
          <div className="news-actions">
            <button type="button" className="link" onClick={() => setReading(0)}>
              {t('news.read')}
            </button>
            {items.length > 1 && (
              <button type="button" className="link" onClick={() => setReading(1)}>
                {t('news.previous', { count: items.length - 1 })}
              </button>
            )}
          </div>
        </article>
      )}
      {reading !== null && items.length > 0 && <NotesDialog items={items} first={reading} onClose={() => setReading(null)} />}
    </section>
  )
}

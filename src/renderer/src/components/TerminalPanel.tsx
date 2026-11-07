import { useEffect, useRef, useState } from 'react'
import { SERVER_IDS, type ServerId } from '../../../shared/types'
import { useI18n } from '../i18n'
import { useServerLogs } from '../useLauncher'

/** An error line, or a line of its stack trace; a warning. Shown in colour, and what "Errors only" keeps. */
const ERROR_LINE = / ERROR |Exception|^Caused by:|^\s+at |^\s+\.\.\. \d+ more/
const WARN_LINE = / WARN /

interface Props {
  open: boolean
  server: ServerId
  onToggle: () => void
  onSelect: (server: ServerId) => void
}

/**
 * The three servers' consoles, in a drawer at the foot of the home page: closed, it is one bar and the panels have the whole window; it opens
 * on a click, on "Show the log" next to a problem, and by itself when a server fails.
 */
export function TerminalPanel({ open, server, onToggle, onSelect }: Props): React.JSX.Element {
  const { t } = useI18n()
  const all = useServerLogs(server)
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const needle = query.trim().toLowerCase()
  const lines = all.filter(
    (line) => (!errorsOnly || ERROR_LINE.test(line) || WARN_LINE.test(line)) && (!needle || line.toLowerCase().includes(needle))
  )
  const output = useRef<HTMLPreElement>(null)
  const copy = (): void => {
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  // Follows the end of the log unless the person has scrolled up to read.
  const following = useRef(true)

  useEffect(() => {
    const element = output.current
    if (element && following.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [lines, open])

  return (
    <section className={`terminal-drawer${open ? ' open' : ''}`} aria-labelledby="terminals-title" data-testid="terminals">
      <div className="drawer-bar">
        <button
          type="button"
          id="terminals-title"
          className="drawer-toggle"
          aria-expanded={open}
          data-testid="terminals-toggle"
          onClick={onToggle}
        >
          <span className="chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {t('section.terminals')}
        </button>
        <div className="tabs" role="tablist">
          {SERVER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={server === id}
              onClick={() => {
                onSelect(id)
                if (!open) {
                  onToggle()
                }
              }}
            >
              {t(`server.${id}`)}
            </button>
          ))}
        </div>
        {open && (
          <div className="terminal-tools">
            <input type="search" value={query} placeholder={t('terminal.search')} aria-label={t('terminal.search')} onChange={(event) => setQuery(event.currentTarget.value)} />
            <label className="toggle-label">
              <input type="checkbox" checked={errorsOnly} onChange={(event) => setErrorsOnly(event.currentTarget.checked)} />
              {t('terminal.errorsOnly')}
            </label>
            <button type="button" className="small" disabled={lines.length === 0} onClick={copy}>
              {copied ? t('terminal.copied') : t('terminal.copy')}
            </button>
            <button type="button" className="small" data-testid="terminal-folder" onClick={() => void window.launcher.openLogFolder(server)}>
              {t('terminal.openFolder')}
            </button>
          </div>
        )}
      </div>
      <pre
        ref={output}
        className="terminal"
        role="log"
        hidden={!open}
        aria-label={t(`server.${server}`)}
        onScroll={(event) => {
          const element = event.currentTarget
          following.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24
        }}
      >
        {lines.length
          ? lines.map((line, index) => {
              const kind = ERROR_LINE.test(line) ? 'log-error' : WARN_LINE.test(line) ? 'log-warn' : undefined
              // one text node a line, the colour on the lines that need it: copying the selection gives the log as it was
              return kind ? (
                <span key={index} className={kind}>
                  {line}
                  {'\n'}
                </span>
              ) : (
                `${line}\n`
              )
            })
          : all.length
            ? t('terminal.noMatch')
            : t('terminal.empty')}
      </pre>
    </section>
  )
}

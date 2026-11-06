import { useEffect, useRef } from 'react'
import { SERVER_IDS, type ServerId } from '../../../shared/types'
import { useI18n } from '../i18n'
import { useServerLogs } from '../useLauncher'

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
  const lines = useServerLogs(server)
  const output = useRef<HTMLPreElement>(null)
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
        {lines.length ? lines.join('\n') : t('terminal.empty')}
      </pre>
    </section>
  )
}

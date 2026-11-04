import { useEffect, useRef, useState } from 'react'
import { SERVER_IDS, type ServerId } from '../../../shared/types'
import { useI18n } from '../i18n'
import { useServerLogs } from '../useLauncher'

export function TerminalPanel(): React.JSX.Element {
  const { t } = useI18n()
  const [server, setServer] = useState<ServerId>('game')
  const lines = useServerLogs(server)
  const output = useRef<HTMLPreElement>(null)
  // Follows the end of the log unless the person has scrolled up to read.
  const following = useRef(true)

  useEffect(() => {
    const element = output.current
    if (element && following.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [lines])

  return (
    <section className="panel terminal-panel" aria-labelledby="terminals-title">
      <h2 id="terminals-title">{t('section.terminals')}</h2>
      <div className="tabs" role="tablist">
        {SERVER_IDS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={server === id} onClick={() => setServer(id)}>
            {t(`server.${id}`)}
          </button>
        ))}
      </div>
      <pre
        ref={output}
        className="terminal"
        role="log"
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

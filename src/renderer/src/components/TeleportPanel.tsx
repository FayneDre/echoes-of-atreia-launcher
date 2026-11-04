import { useEffect, useState } from 'react'
import type { CharacterSummary, DestinationSummary, Problem } from '../../../shared/types'
import { useI18n } from '../i18n'
import { ProblemText } from './ProblemText'

/** Sends the character played to a place of the world. The game server does it, so it must run and the character must be in game. */
export function TeleportPanel(props: { character: CharacterSummary; gameReady: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [destinations, setDestinations] = useState<DestinationSummary[]>([])
  const [filter, setFilter] = useState('')
  const [chosen, setChosen] = useState<number | null>(null)
  const [problem, setProblem] = useState<Problem | undefined>()
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!props.gameReady) {
      setDestinations([])
      return
    }
    void window.launcher.getDestinations().then((answer) => {
      if (Array.isArray(answer)) {
        setDestinations(answer)
        setProblem(undefined)
      } else {
        setProblem(answer)
      }
    })
  }, [props.gameReady])

  const shown = destinations.filter((destination) => destination.name.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 200)
  const send = async (): Promise<void> => {
    if (chosen === null) {
      return
    }
    setBusy(true)
    setDone(false)
    const result = await window.launcher.teleport(chosen)
    setProblem(result ?? undefined)
    setDone(result === null)
    setBusy(false)
  }

  return (
    <div className="teleport" data-testid="teleport">
      <h4>{t('teleport.title', { name: props.character.name })}</h4>
      {!props.gameReady ? (
        <p className="muted">{t('teleport.needsServer')}</p>
      ) : (
        <>
          <input
            type="search"
            value={filter}
            placeholder={t('teleport.search')}
            aria-label={t('teleport.search')}
            onChange={(event) => setFilter(event.currentTarget.value)}
          />
          <select
            size={6}
            aria-label={t('teleport.destinations')}
            value={chosen ?? ''}
            onChange={(event) => setChosen(Number(event.currentTarget.value))}
          >
            {shown.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
          <button type="button" className="button-primary" disabled={busy || chosen === null} onClick={() => void send()}>
            {t('teleport.go')}
          </button>
          {done && <p role="status">{t('teleport.done')}</p>}
          <ProblemText problem={problem} />
        </>
      )}
    </div>
  )
}

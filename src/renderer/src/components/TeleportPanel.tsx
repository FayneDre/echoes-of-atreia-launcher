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

  const online = props.character.online
  const loaded = destinations.length > 0
  useEffect(() => {
    if (!props.gameReady) {
      setDestinations([])
      return
    }
    // Asked again each time the character comes into the game while the list is still missing: a first request may have found the server busy.
    if (!online || loaded) {
      return
    }
    let current = true
    void window.launcher.getDestinations().then((answer) => {
      if (!current) {
        return
      }
      if (Array.isArray(answer)) {
        setDestinations(answer)
        setProblem(undefined)
      } else {
        setProblem(answer)
      }
    })
    return () => {
      current = false
    }
  }, [props.gameReady, online, loaded])

  const shown = destinations.filter((destination) => destination.name.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 200)
  // A choice the filter hides is no choice: the button must not send the character somewhere the list does not show.
  const target = shown.some((destination) => destination.id === chosen) ? chosen : null
  const send = async (): Promise<void> => {
    if (target === null) {
      return
    }
    setBusy(true)
    setDone(false)
    const result = await window.launcher.teleport(target)
    setProblem(result ?? undefined)
    setDone(result === null)
    setBusy(false)
  }

  return (
    <div className="teleport" data-testid="teleport">
      <h4>{t('teleport.title', { name: props.character.name })}</h4>
      {!props.gameReady || !props.character.online ? (
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
            value={target ?? ''}
            onChange={(event) => {
              setChosen(Number(event.currentTarget.value))
              setDone(false)
            }}
          >
            {shown.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.name}
              </option>
            ))}
          </select>
          <button type="button" className="button-primary" disabled={busy || target === null} onClick={() => void send()}>
            {t('teleport.go')}
          </button>
          {done && <p role="status">{t('teleport.done')}</p>}
          <ProblemText problem={problem} />
        </>
      )}
    </div>
  )
}

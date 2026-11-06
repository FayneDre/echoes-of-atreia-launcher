import { useEffect, useState } from 'react'
import { SERVER_IDS, type AccountsState, type HomeInfo, type LauncherState } from '../../../shared/types'
import { hasMessage, useI18n, type MessageKey } from '../i18n'
import { Icon } from './Icon'
import { ProblemText } from './ProblemText'
import { useToast } from './Toasts'

interface Props {
  state: LauncherState
  accounts: AccountsState | null
  info: HomeInfo | null
  onReloadInfo: () => void
}

/** "3 h 05", "12 min": how long the game server has run. */
function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`
}

/**
 * The top of the home page: where the stack stands in one phrase, the character played, what the world holds, the last backup, and the
 * buttons that start, stop and play. The servers' rows below give the details.
 */
export function HomeHero({ state, accounts, info, onReloadInfo }: Props): React.JSX.Element {
  const { language, t } = useI18n()
  const notify = useToast()
  const [now, setNow] = useState(Date.now())
  const [backingUp, setBackingUp] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const { servers, activity, install } = state
  const idle = activity === 'idle'
  const ready = SERVER_IDS.filter((id) => servers[id].status === 'ready').length
  const failed = SERVER_IDS.some((id) => servers[id].status === 'failed')
  const running = SERVER_IDS.some((id) => !['stopped', 'failed'].includes(servers[id].status) || servers[id].external)
  const gameReady = servers.game.status === 'ready'
  const canStop = running && (idle || activity === 'starting')

  const [phrase, mood]: [MessageKey, string] = gameReady
    ? ['hero.ready', 'ready']
    : failed
      ? ['hero.failed', 'failed']
      : activity === 'starting'
        ? ['hero.starting', 'busy']
        : activity === 'stopping'
          ? ['hero.stopping', 'busy']
          : activity === 'server-update'
            ? ['hero.updating', 'busy']
            : running
              ? ['hero.partial', 'busy']
              : ['hero.stopped', 'stopped']

  const character = accounts?.characters.find((candidate) => candidate.id === accounts.selectedCharacterId)
  const classKey = character ? `class.${character.playerClass}` : ''
  const readyAt = servers.game.readyAt

  const backup = async (): Promise<void> => {
    setBackingUp(true)
    const problem = await window.launcher.createBackup()
    setBackingUp(false)
    notify(problem ? t(`problem.${problem.code}`) : t('hero.backupDone'), problem ? 'error' : 'success')
    onReloadInfo()
  }

  return (
    <section className={`panel hero hero-${mood}`} aria-labelledby="hero-title" data-testid="hero">
      <div className="hero-main">
        <div className="hero-state">
          <span className={`hero-sigil sigil-${mood}`} aria-hidden="true" />
          <div>
            <h2 id="hero-title" className="hero-title">
              {t(phrase)}
            </h2>
            <p className="hero-sub">
              {gameReady && readyAt !== undefined
                ? t('hero.uptime', { duration: duration(Math.max(0, now - readyAt)) })
                : activity === 'starting' || running
                  ? t('hero.progress', { ready })
                  : t('hero.stoppedHint')}
            </p>
          </div>
        </div>
        <div className="hero-actions">
          <button type="button" disabled={!idle || !install.serverFound || gameReady} onClick={() => void window.launcher.start()}>
            <Icon name="play" />
            {t('action.start')}
          </button>
          <button type="button" disabled={!canStop} onClick={() => void window.launcher.stop()}>
            <Icon name="stop" />
            {t('action.stop')}
          </button>
          <button
            type="button"
            className="button-primary button-play"
            disabled={!gameReady || !install.clientFound}
            onClick={() => void window.launcher.play()}
          >
            {t('action.play')}
          </button>
        </div>
      </div>
      <ProblemText problem={state.problem} />

      <dl className="hero-facts">
        <div className={character ? `fact fact-${character.race.toLowerCase()}` : 'fact'}>
          <dt>{t('hero.character')}</dt>
          <dd data-testid="hero-character">
            {character
              ? `${character.name} · ${t('account.level', { level: character.level })} ${hasMessage(classKey) ? t(classKey) : character.playerClass}${character.mapName ? ` · ${character.mapName}` : ''}`
              : t('hero.noCharacter')}
          </dd>
        </div>
        <div className="fact">
          <dt>{t('hero.bots')}</dt>
          <dd data-testid="hero-bots">
            {info?.botsInWorld ? (
              <>
                <span className="elyos">{t('hero.botsElyos', { count: info.botsInWorld.elyos })}</span> ·{' '}
                <span className="asmodians">{t('hero.botsAsmodians', { count: info.botsInWorld.asmodians })}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="fact">
          <dt>{t('hero.memory')}</dt>
          <dd data-testid="hero-memory">{info?.gameMemoryMb != null ? t('hero.memoryValue', { mb: info.gameMemoryMb }) : '—'}</dd>
        </div>
        <div className="fact">
          <dt>{t('hero.lastBackup')}</dt>
          <dd data-testid="hero-backup">
            {info?.lastBackup ? new Date(info.lastBackup).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' }) : t('hero.noBackup')}
            <button type="button" className="small link" disabled={backingUp || !install.serverFound || !idle} onClick={() => void backup()}>
              {t('hero.backupNow')}
            </button>
          </dd>
        </div>
      </dl>
    </section>
  )
}

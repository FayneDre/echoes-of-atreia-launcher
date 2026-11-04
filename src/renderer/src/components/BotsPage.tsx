import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BotSummary, LauncherState, Problem } from '../../../shared/types'
import { hasMessage, useI18n } from '../i18n'
import { ProblemText } from './ProblemText'

const SHOWN = 150
const FACTIONS = ['ELYOS', 'ASMODIANS'] as const

function BotRow({ bot }: { bot: BotSummary }): React.JSX.Element {
  const { t } = useI18n()
  const classKey = `class.${bot.playerClass}`
  return (
    <li className="bot" data-testid={`bot-${bot.name}`}>
      <span className="bot-top">
        <span className="bot-name">{bot.name}</span>
        {bot.inWorld && <span className="tag tag-online">{t('bots.inWorld')}</span>}
        {bot.resident && <span className="tag">{t('bots.resident')}</span>}
      </span>
      <span className="bot-line">
        {t('account.level', { level: bot.level })} · {hasMessage(classKey) ? t(classKey) : bot.playerClass}
        {bot.mapName ? ` · ${bot.mapName}` : ''}
      </span>
    </li>
  )
}

/** The server's bots, one column a faction. They are read from the database, so the list is there with the servers stopped. */
export function BotsPage({ state, visible }: { state: LauncherState; visible: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [bots, setBots] = useState<BotSummary[] | null>(null)
  const [problem, setProblem] = useState<Problem | undefined>()
  const [filter, setFilter] = useState('')
  const reload = useCallback(async () => {
    const answer = await window.launcher.listBots()
    if (Array.isArray(answer)) {
      setBots(answer)
      setProblem(undefined)
    } else {
      setProblem(answer)
    }
  }, [])
  const serverFound = state.install.serverFound
  const gameStatus = state.servers.game.status
  useEffect(() => {
    if (visible && serverFound) {
      void reload()
    }
  }, [visible, serverFound, gameStatus, state.mysql.status, reload])

  const needle = filter.trim().toLowerCase()
  const byFaction = useMemo(
    () =>
      FACTIONS.map((race) => {
        const all = (bots ?? []).filter((bot) => bot.race === race)
        const matching = needle ? all.filter((bot) => bot.name.toLowerCase().includes(needle)) : all
        return { race, all, matching: matching.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)) }
      }),
    [bots, needle]
  )

  return (
    <section className="panel bots-page" aria-labelledby="bots-title">
      <header className="settings-header">
        <h2 id="bots-title">{t('bots.title')}</h2>
        <p className="muted">{t('bots.intro')}</p>
      </header>
      <div className="bots-toolbar">
        <input type="search" value={filter} placeholder={t('bots.search')} aria-label={t('bots.search')} onChange={(event) => setFilter(event.currentTarget.value)} />
        <button type="button" className="small" onClick={() => void reload()}>
          {t('bots.refresh')}
        </button>
      </div>
      <ProblemText problem={problem} />
      {bots !== null && bots.length === 0 && <p className="muted">{t('bots.none')}</p>}
      {bots !== null && bots.length > 0 && (
        <div className="factions">
          {byFaction.map(({ race, all, matching }) => (
            <div key={race} className="faction" data-testid={`faction-${race}`}>
              <h3>
                {t(`race.${race}`)}
                <span className="muted faction-count">{t('bots.summary', { count: all.length, present: all.filter((bot) => bot.inWorld).length })}</span>
              </h3>
              {matching.length === 0 ? (
                <p className="muted">{t('bots.noMatch')}</p>
              ) : (
                <ul className="bot-list">
                  {matching.slice(0, SHOWN).map((bot) => (
                    <BotRow key={bot.id} bot={bot} />
                  ))}
                </ul>
              )}
              {matching.length > SHOWN && <p className="muted">{t('bots.more', { shown: SHOWN, total: matching.length })}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

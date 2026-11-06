import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BotSummary, LauncherState, Problem } from '../../../shared/types'
import { hasMessage, useI18n } from '../i18n'
import { ProblemText } from './ProblemText'

/** A page of each faction's list, and how many more each click shows. */
const PAGE = 20
const FACTIONS = ['ELYOS', 'ASMODIANS'] as const

/** One line a bot: name, level, class, map. `inWorld` is what the database says, which only a running game server keeps true. */
function BotRow({ bot, inWorld }: { bot: BotSummary; inWorld: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const classKey = `class.${bot.playerClass}`
  return (
    <li className="bot" data-testid={`bot-${bot.name}`}>
      <span className={`presence${inWorld ? ' present' : ''}`} title={inWorld ? t('bots.inWorld') : undefined} aria-hidden="true" />
      <span className="bot-name">{bot.name}</span>
      {inWorld && <span className="visually-hidden">{t('bots.inWorld')}</span>}
      <span className="bot-level">{bot.level}</span>
      <span className="bot-class">{hasMessage(classKey) ? t(classKey) : bot.playerClass}</span>
      <span className="bot-map">{bot.mapName ?? ''}</span>
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

  // The database keeps `online` set when a game server ends without saving (killed, crashed): only a running one is believed.
  const live = gameStatus === 'ready'
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [filter])
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
                <span className="muted faction-count">
                  {live ? t('bots.summary', { count: all.length, present: all.filter((bot) => bot.inWorld).length }) : t('bots.count', { count: all.length })}
                </span>
              </h3>
              {matching.length === 0 ? (
                <p className="muted">{t('bots.noMatch')}</p>
              ) : (
                <ul className="bot-list">
                  {matching.slice(0, limit).map((bot) => (
                    <BotRow key={bot.id} bot={bot} inWorld={live && bot.inWorld} />
                  ))}
                </ul>
              )}
              {matching.length > limit && (
                <div className="bot-more">
                  <span className="muted">{t('bots.more', { shown: limit, total: matching.length })}</span>
                  <button type="button" className="small" onClick={() => setLimit(limit + PAGE)}>
                    {t('bots.showMore', { count: Math.min(PAGE, matching.length - limit) })}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

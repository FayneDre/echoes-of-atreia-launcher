import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { POPULATION_API_LEVEL, type BotSummary, type LauncherState, type Problem } from '../../../shared/types'
import { hasMessage, useI18n } from '../i18n'
import { PopulationPanel } from './PopulationPanel'
import { ProblemText } from './ProblemText'

/** The room a bot's line takes, before one is drawn to be measured. */
const ROW_ESTIMATE = 32
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
  const [classFilter, setClassFilter] = useState('')
  const [mapFilter, setMapFilter] = useState('')
  // Each faction's list is cut in pages of as many lines as its room holds: the page never scrolls, whatever the number of bots.
  const [pages, setPages] = useState<Record<string, number>>({})
  useEffect(() => setPages({}), [filter, classFilter, mapFilter])
  const listArea = useRef<HTMLDivElement>(null)
  const [perPage, setPerPage] = useState(1)
  // measured before the page is drawn: never a first frame of one line a page
  useLayoutEffect(() => {
    const area = listArea.current
    if (!area) {
      return
    }
    const measure = (): void => {
      const list = area.querySelector('.bot-list')
      const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0
      const row = area.querySelector('.bot')?.getBoundingClientRect().height ?? ROW_ESTIMATE
      // the list's own border too: the last line must end inside the room
      const frame = list ? list.getBoundingClientRect().height - list.clientHeight : 0
      setPerPage(Math.max(1, Math.floor((area.clientHeight - frame + gap) / (row + gap))))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    return () => observer.disconnect()
  }, [bots, visible])
  const needle = filter.trim().toLowerCase()
  const classes = useMemo(() => [...new Set((bots ?? []).map((bot) => bot.playerClass))].sort(), [bots])
  const maps = useMemo(() => [...new Set((bots ?? []).flatMap((bot) => (bot.mapName ? [bot.mapName] : [])))].sort(), [bots])
  const byFaction = useMemo(
    () =>
      FACTIONS.map((race) => {
        const all = (bots ?? []).filter((bot) => bot.race === race)
        const matching = all.filter(
          (bot) =>
            (!needle || bot.name.toLowerCase().includes(needle)) &&
            (!classFilter || bot.playerClass === classFilter) &&
            (!mapFilter || bot.mapName === mapFilter)
        )
        return { race, all, matching: matching.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)) }
      }),
    [bots, needle, classFilter, mapFilter]
  )
  const className = (playerClass: string): string => {
    const key = `class.${playerClass}`
    return hasMessage(key) ? t(key) : playerClass
  }
  // how the bots spread over the levels, by tens
  const bands = useMemo(() => {
    const counts = new Map<number, number>()
    for (const bot of bots ?? []) {
      const band = Math.min(Math.floor(bot.level / 10), 6)
      counts.set(band, (counts.get(band) ?? 0) + 1)
    }
    const most = Math.max(1, ...counts.values())
    return [0, 1, 2, 3, 4, 5, 6].map((band) => ({ band, count: counts.get(band) ?? 0, share: (counts.get(band) ?? 0) / most }))
  }, [bots])

  return (
    <section className="panel bots-page" aria-labelledby="bots-title">
      <header className="settings-header">
        <h2 id="bots-title">{t('bots.title')}</h2>
        <p className="muted">{t('bots.intro')}</p>
      </header>
      <div className="bots-toolbar">
        <input type="search" value={filter} placeholder={t('bots.search')} aria-label={t('bots.search')} onChange={(event) => setFilter(event.currentTarget.value)} />
        <select value={classFilter} aria-label={t('bots.class')} onChange={(event) => setClassFilter(event.currentTarget.value)}>
          <option value="">{t('bots.allClasses')}</option>
          {classes.map((playerClass) => (
            <option key={playerClass} value={playerClass}>
              {className(playerClass)}
            </option>
          ))}
        </select>
        <select value={mapFilter} aria-label={t('bots.map')} onChange={(event) => setMapFilter(event.currentTarget.value)}>
          <option value="">{t('bots.allMaps')}</option>
          {maps.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </select>
        <button type="button" className="small" onClick={() => void reload()}>
          {t('bots.refresh')}
        </button>
      </div>
      {/* side by side, the population and the levels leave the lists the most room */}
      <div className="bots-overview">
        {/* the server's level is learnt just after it is ready: the panel asks once it is known */}
        <PopulationPanel visible={visible} ready={live && (state.serverVersion?.apiLevel ?? 0) >= POPULATION_API_LEVEL} />
        {bots !== null && bots.length > 0 && (
          <div className="level-bands" aria-label={t('bots.levels')} data-testid="level-bands">
            {bands.map(({ band, count, share }) => (
              <div key={band} className="level-band" title={t('bots.bandTitle', { count })}>
                <span className="level-bar" style={{ height: `${Math.round(share * 100)}%` }} />
                <span className="level-count">{count}</span>
                <span className="level-label">{band === 6 ? '60+' : `${Math.max(1, band * 10)}–${band * 10 + 9}`}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <ProblemText problem={problem} />
      {bots !== null && bots.length === 0 && <p className="muted">{t('bots.none')}</p>}
      {bots !== null && bots.length > 0 && (
        <div className="factions">
          {byFaction.map(({ race, all, matching }, index) => {
            const last = Math.max(0, Math.ceil(matching.length / perPage) - 1)
            const current = Math.min(pages[race] ?? 0, last)
            const from = current * perPage
            const turn = (to: number): void => setPages({ ...pages, [race]: to })
            return (
              <div key={race} className="faction" data-testid={`faction-${race}`}>
                <h3>
                  {t(`race.${race}`)}
                  <span className="muted faction-count">
                    {live ? t('bots.summary', { count: all.length, present: all.filter((bot) => bot.inWorld).length }) : t('bots.count', { count: all.length })}
                  </span>
                </h3>
                {/* both columns have the same room: the first one's is measured */}
                <div className="bot-list-area" ref={index === 0 ? listArea : undefined}>
                  {matching.length === 0 ? (
                    <p className="muted">{t('bots.noMatch')}</p>
                  ) : (
                    <ul className="bot-list">
                      {matching.slice(from, from + perPage).map((bot) => (
                        <BotRow key={bot.id} bot={bot} inWorld={live && bot.inWorld} />
                      ))}
                    </ul>
                  )}
                </div>
                <div className="bot-pager" data-testid={`pager-${race}`}>
                  <button type="button" className="small" disabled={current === 0} onClick={() => turn(current - 1)}>
                    ‹ {t('bots.previous')}
                  </button>
                  <span className="muted">
                    {matching.length > 0 && t('bots.range', { from: from + 1, to: Math.min(from + perPage, matching.length), total: matching.length })}
                  </span>
                  <button type="button" className="small" disabled={current >= last} onClick={() => turn(current + 1)}>
                    {t('bots.next')} ›
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

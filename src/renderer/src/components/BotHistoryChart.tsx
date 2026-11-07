import { useEffect, useRef, useState } from 'react'
import type { BotSample } from '../../../shared/types'
import { useI18n } from '../i18n'

/** How often the page asks for the curve while it shows: the launcher counts a point a minute. */
const REFRESH_MS = 20_000
const SPAN_MS = 60 * 60 * 1000
/** Two points further apart than this are not joined: the game server was down, or the count could not be read, in between. */
const GAP_MS = 3 * 60 * 1000

/** Drawn at the width it is shown at, so the text keeps its size whatever the window's; this until it is measured. */
const DEFAULT_WIDTH = 640
const HEIGHT = 168
const PLOT = { left: 34, right: 96, top: 12, bottom: 26 }

/** The two factions, in a fixed order, each with its colour (checked for colour blindness on the panels' surface). */
const SERIES = [
  { key: 'elyos', race: 'ELYOS', colour: '#3a9ad0' },
  { key: 'asmodians', race: 'ASMODIANS', colour: '#d0708e' }
] as const

/** A round top for the scale: 4, 10, 25, 60... so the grid lines fall on numbers one reads at a glance. */
function niceMax(value: number): number {
  if (value <= 4) {
    return 4
  }
  const power = 10 ** Math.floor(Math.log10(value))
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= value) ?? 10
  return step * power
}

/** The last hour of bots in the world, one line a faction, from the counts the launcher takes while the game server runs. */
export function BotHistoryChart({ visible }: { visible: boolean }): React.JSX.Element {
  const { t } = useI18n()
  const [samples, setSamples] = useState<BotSample[]>([])
  const [now, setNow] = useState(Date.now())
  const [hover, setHover] = useState<BotSample | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const plotBox = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)

  useEffect(() => {
    const element = plotBox.current
    if (!element) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        setWidth(Math.round(entry.contentRect.width))
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [samples.length > 0])

  useEffect(() => {
    if (!visible) {
      return
    }
    const read = (): void => {
      void window.launcher.getBotHistory().then((history) => {
        setSamples(history)
        setNow(Date.now())
      })
    }
    read()
    const timer = setInterval(read, REFRESH_MS)
    return () => clearInterval(timer)
  }, [visible])

  const top = niceMax(Math.max(0, ...samples.flatMap((sample) => [sample.elyos, sample.asmodians])))
  const plotWidth = width - PLOT.left - PLOT.right
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom
  const x = (at: number): number => PLOT.left + ((at - (now - SPAN_MS)) / SPAN_MS) * plotWidth
  const y = (count: number): number => PLOT.top + plotHeight - (count / top) * plotHeight
  const path = (key: 'elyos' | 'asmodians'): string =>
    samples
      .map((sample, index) => {
        const joined = index > 0 && sample.at - samples[index - 1]!.at <= GAP_MS
        return `${joined ? 'L' : 'M'}${x(sample.at).toFixed(1)},${y(sample[key]).toFixed(1)}`
      })
      .join(' ')
  const last = samples.at(-1)
  const minutesAgo = (at: number): string => {
    const minutes = Math.round((now - at) / 60_000)
    return minutes <= 0 ? t('bots.historyNow') : t('bots.historyAgo', { count: minutes })
  }

  const onMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || samples.length === 0) {
      return
    }
    const pointer = ((event.clientX - box.left) / box.width) * width
    const nearest = samples.reduce((best, sample) => (Math.abs(x(sample.at) - pointer) < Math.abs(x(best.at) - pointer) ? sample : best))
    setHover(nearest)
  }

  return (
    <div className="bot-history" data-testid="bot-history">
      <div className="bot-history-head">
        <h3>{t('bots.history')}</h3>
        <ul className="chart-legend">
          {SERIES.map((series) => (
            <li key={series.key}>
              <span className="chart-swatch" style={{ background: series.colour }} aria-hidden="true" />
              {t(`race.${series.race}`)}
            </li>
          ))}
        </ul>
      </div>
      {samples.length === 0 ? (
        <p className="muted bot-history-empty">{t('bots.historyEmpty')}</p>
      ) : (
        <div className="bot-history-plot" ref={plotBox}>
          <svg
            ref={svg}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label={t('bots.history')}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {[0, 0.5, 1].map((share) => (
              <g key={share}>
                <line className="chart-grid" x1={PLOT.left} x2={PLOT.left + plotWidth} y1={y(top * share)} y2={y(top * share)} />
                <text className="chart-axis" x={PLOT.left - 6} y={y(top * share) + 4} textAnchor="end">
                  {top * share}
                </text>
              </g>
            ))}
            {[60, 45, 30, 15, 0].map((minutes) => (
              <text key={minutes} className="chart-axis" x={x(now - minutes * 60_000)} y={HEIGHT - 6} textAnchor={minutes === 60 ? 'start' : 'middle'}>
                {minutes === 0 ? t('bots.historyNow') : `−${minutes} min`}
              </text>
            ))}
            {SERIES.map((series) => (
              <path key={series.key} d={path(series.key)} fill="none" stroke={series.colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* a point alone, with no neighbour to join, is still seen */}
            {SERIES.map((series) =>
              samples
                .filter((sample, index) => {
                  const before = samples[index - 1]
                  const after = samples[index + 1]
                  return (!before || sample.at - before.at > GAP_MS) && (!after || after.at - sample.at > GAP_MS)
                })
                .map((sample) => <circle key={`${series.key}-${sample.at}`} cx={x(sample.at)} cy={y(sample[series.key])} r={3} fill={series.colour} />)
            )}
            {last &&
              SERIES.map((series, index) => {
                // the two labels kept apart when the lines end close together: the higher one above, the Elyos above on a tie
                const other = last[SERIES[1 - index]!.key]
                const own = last[series.key]
                const above = own > other || (own === other && index === 0)
                const nudge = Math.abs(y(own) - y(other)) < 14 ? (above ? -7 : 7) : 0
                return (
                  <text key={series.key} className="chart-label" x={x(last.at) + 8} y={y(own) + 4 + nudge} data-testid={`bot-history-${series.key}`}>
                    {t(`race.${series.race}`)} {own}
                  </text>
                )
              })}
            {hover && (
              <g pointerEvents="none">
                <line className="chart-crosshair" x1={x(hover.at)} x2={x(hover.at)} y1={PLOT.top} y2={PLOT.top + plotHeight} />
                {SERIES.map((series) => (
                  <circle key={series.key} cx={x(hover.at)} cy={y(hover[series.key])} r={4} fill={series.colour} stroke="var(--bg-raised)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
          {hover && (
            <div
              className="chart-tooltip"
              style={{ left: `${(x(hover.at) / width) * 100}%` }}
              data-flip={x(hover.at) > width / 2 ? 'left' : 'right'}
              role="status"
            >
              <strong>{minutesAgo(hover.at)}</strong>
              {SERIES.map((series) => (
                <span key={series.key}>
                  <span className="chart-swatch" style={{ background: series.colour }} aria-hidden="true" />
                  {t(`race.${series.race}`)} <b>{hover[series.key]}</b>
                </span>
              ))}
            </div>
          )}
          <table className="visually-hidden">
            <caption>{t('bots.history')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('bots.historyWhen')}</th>
                {SERIES.map((series) => (
                  <th key={series.key} scope="col">
                    {t(`race.${series.race}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={sample.at}>
                  <td>{minutesAgo(sample.at)}</td>
                  <td>{sample.elyos}</td>
                  <td>{sample.asmodians}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

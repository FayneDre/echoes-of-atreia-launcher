import { useEffect, useState } from 'react'
import type { PopulationState } from '../../../shared/types'
import { hasMessage, useI18n } from '../i18n'

/** The server reviews its population every 30 s: asking more often would only show the same review again. */
const REFRESH_MS = 15_000

/**
 * Where the running game server's population stands: bots in the world against what the density asks for, and whether the server's guard holds
 * the arrivals because the machine runs short. Nothing is shown without a game server ready, or with one too old to say.
 */
export function PopulationPanel({ visible, ready }: { visible: boolean; ready: boolean }): React.JSX.Element | null {
  const { t } = useI18n()
  const [population, setPopulation] = useState<PopulationState | null>(null)
  useEffect(() => {
    if (!visible || !ready) {
      setPopulation(null)
      return
    }
    let current = true
    const read = async (): Promise<void> => {
      const answer = await window.launcher.getPopulation()
      // a fault reads as nothing to show: the bot list below says what the database knows either way
      if (current) {
        setPopulation(answer !== null && !('code' in answer) ? answer : null)
      }
    }
    void read()
    const timer = setInterval(() => void read(), REFRESH_MS)
    return () => {
      current = false
      clearInterval(timer)
    }
  }, [visible, ready])

  if (population === null) {
    return null
  }
  const modeKey = `option.bots.density.mode.${population.mode}`
  const mode = hasMessage(modeKey) ? t(modeKey) : population.mode
  const causes = population.guard.causes.map((cause) => {
    const key = `population.cause.${cause}`
    return hasMessage(key) ? t(key) : cause
  })
  const { totals, guard } = population
  return (
    <div className="population" data-testid="population">
      <h3>{t('population.title')}</h3>
      <dl>
        <div>
          <dt>{t('population.inWorld')}</dt>
          <dd>
            {totals
              ? t('population.totals', { awake: totals.awake, wanted: totals.wanted, asleep: totals.asleep })
              : t('population.firstReview')}
          </dd>
        </div>
        <div>
          <dt>{t('population.density')}</dt>
          <dd>{population.mode === 'AUTO' ? mode : t('population.densityPercent', { mode, percent: population.percent })}</dd>
        </div>
        <div>
          <dt>{t('population.guard')}</dt>
          <dd className={guard.state === 'held' ? 'population-held' : undefined}>
            {guard.state === 'held' ? t('population.held', { causes: causes.join(', ') }) : t(`population.${guard.state}`)}
          </dd>
        </div>
        <div>
          <dt>{t('population.heap')}</dt>
          <dd>{population.heapPercent === null ? t('population.heapUnknown') : `${population.heapPercent} %`}</dd>
        </div>
      </dl>
    </div>
  )
}

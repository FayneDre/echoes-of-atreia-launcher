import { useEffect, useState } from 'react'
import { SETTING_LIMITS, type LauncherState, type ServerSettings } from '../../../shared/types'
import { useI18n, type MessageKey } from '../i18n'

const OFFICIAL: ServerSettings = { xpRate: 1, apRate: 1, gpRate: 1, gpDailyLossPercent: 100, bothFactions: false }

type Feedback = 'saved' | 'failed' | null

function RateField(props: {
  id: string
  label: MessageKey
  value: number
  onChange: (value: number) => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="setting-row">
      <label htmlFor={props.id}>{t(props.label)}</label>
      <div className="rate-input">
        <span aria-hidden="true">x</span>
        <input
          id={props.id}
          type="number"
          min={SETTING_LIMITS.rate.min}
          max={SETTING_LIMITS.rate.max}
          step={0.5}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.valueAsNumber)}
        />
      </div>
    </div>
  )
}

function isValid(settings: ServerSettings): boolean {
  const rateOk = (rate: number): boolean => Number.isFinite(rate) && rate >= SETTING_LIMITS.rate.min && rate <= SETTING_LIMITS.rate.max
  return rateOk(settings.xpRate) && rateOk(settings.apRate) && rateOk(settings.gpRate)
}

export function SettingsPage({ state }: { state: LauncherState }): React.JSX.Element {
  const { t } = useI18n()
  const [settings, setSettings] = useState<ServerSettings | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const serverRoot = state.install.serverFound ? state.install.serverRoot : null

  useEffect(() => {
    setSettings(null)
    if (serverRoot) {
      void window.launcher.getServerSettings().then(setSettings)
    }
  }, [serverRoot])

  if (!serverRoot) {
    return (
      <section className="panel settings-page">
        <h2>{t('nav.settings')}</h2>
        <p className="muted">{t('settings.noServer')}</p>
      </section>
    )
  }
  if (!settings) {
    return <section className="panel settings-page" aria-busy="true" />
  }

  const change = (next: Partial<ServerSettings>): void => {
    setSettings({ ...settings, ...next })
    setFeedback(null)
  }
  const save = async (): Promise<void> => {
    setFeedback((await window.launcher.saveServerSettings(settings)) ? 'saved' : 'failed')
  }

  return (
    <section className="panel settings-page" aria-labelledby="settings-title">
      <h2 id="settings-title">{t('nav.settings')}</h2>
      <p className="muted">{t('settings.intro')}</p>

      <RateField id="xp-rate" label="settings.xp" value={settings.xpRate} onChange={(xpRate) => change({ xpRate })} />
      <RateField id="ap-rate" label="settings.ap" value={settings.apRate} onChange={(apRate) => change({ apRate })} />
      <RateField id="gp-rate" label="settings.gp" value={settings.gpRate} onChange={(gpRate) => change({ gpRate })} />

      <div className="setting-row">
        <label htmlFor="gp-loss">{t('settings.gpLoss')}</label>
        <div className="range-input">
          <input
            id="gp-loss"
            type="range"
            min={SETTING_LIMITS.gpDailyLossPercent.min}
            max={SETTING_LIMITS.gpDailyLossPercent.max}
            step={10}
            value={settings.gpDailyLossPercent}
            onChange={(event) => change({ gpDailyLossPercent: event.currentTarget.valueAsNumber })}
          />
          <output htmlFor="gp-loss">{settings.gpDailyLossPercent} %</output>
        </div>
      </div>
      <p className="hint">{t('settings.gpLossHint')}</p>

      <div className="setting-row">
        <label htmlFor="both-factions">{t('settings.bothFactions')}</label>
        <input
          id="both-factions"
          type="checkbox"
          checked={settings.bothFactions}
          onChange={(event) => change({ bothFactions: event.currentTarget.checked })}
        />
      </div>

      <div className="actions">
        <button type="button" onClick={() => change(OFFICIAL)}>
          {t('settings.official')}
        </button>
        <button type="button" className="button-primary" disabled={!isValid(settings)} onClick={() => void save()}>
          {t('settings.save')}
        </button>
      </div>
      {feedback === 'saved' && (
        <p className="success" role="status">
          {t('settings.saved')}
        </p>
      )}
      {feedback === 'failed' && (
        <p className="problem" role="alert">
          {t('settings.saveFailed')}
        </p>
      )}
    </section>
  )
}

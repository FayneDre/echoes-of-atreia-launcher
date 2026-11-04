import { useEffect, useState } from 'react'
import {
  isAllowed,
  LIMITS,
  SETTING_GROUPS,
  type ServerSettings,
  type SettingDefinition,
  type SettingGroup
} from '../../../shared/settingsCatalog'
import type { LauncherState } from '../../../shared/types'
import { hasMessage, useI18n, type MessageKey } from '../i18n'

type Values = Record<string, number>
type Feedback = 'saved' | 'failed' | null

// The labels of the catalog: checked to exist in every language by a unit test, so the cast only spares the type system a template literal.
const groupLabel = (group: SettingGroup): MessageKey => `group.${group.id}` as MessageKey
const settingLabel = (definition: SettingDefinition): MessageKey => `setting.${definition.id}` as MessageKey

function formatOfficial(definition: SettingDefinition, value: number): string {
  switch (definition.kind) {
    case 'multiplier':
      return `x${value}`
    case 'percent':
      return `${value} %`
    default:
      return String(value)
  }
}

function NumberInput(props: {
  label: string
  definition: SettingDefinition
  value: number | null
  placeholder?: string
  onChange: (value: number) => void
}): React.JSX.Element {
  const { definition } = props
  const limits = LIMITS[definition.kind]
  const step = definition.kind === 'multiplier' ? 0.5 : 1
  return (
    <span className="value-input">
      {definition.kind === 'multiplier' && <span aria-hidden="true">x</span>}
      <input
        type="number"
        aria-label={props.label}
        min={limits.min}
        max={limits.max}
        step={step}
        value={props.value === null || Number.isNaN(props.value) ? '' : props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.valueAsNumber)}
      />
      {definition.kind === 'percent' && <span aria-hidden="true">%</span>}
    </span>
  )
}

/** The value every setting of the group shares, or null when they differ. */
function sharedValue(settings: SettingDefinition[], values: Values): number | null {
  const distinct = new Set(settings.map((definition) => values[definition.id]))
  return distinct.size === 1 ? [...distinct][0]! : null
}

/**
 * The share of their official values the group's settings stand at, or null when they do not all stand at the same one. Read from the setting with
 * the largest official value, the only one whose rounding to whole points keeps the share exact.
 */
function sharedPercent(settings: SettingDefinition[], values: Values, official: Values): number | null {
  const largest = settings.reduce((best, definition) => (official[definition.id]! > official[best.id]! ? definition : best), settings[0]!)
  if (!official[largest.id]) {
    return null
  }
  const percent = Math.round((values[largest.id]! / official[largest.id]!) * 100)
  const consistent = settings.every((definition) => Math.round((official[definition.id]! * percent) / 100) === values[definition.id])
  return consistent ? percent : null
}

function GroupView(props: {
  group: SettingGroup
  values: Values
  official: Values
  onChange: (changes: Values) => void
}): React.JSX.Element | null {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const { group, values, official } = props
  // Only what this server's files have.
  const settings = group.settings.filter((definition) => official[definition.id] !== undefined)
  if (settings.length === 0) {
    return null
  }
  const title = t(groupLabel(group))
  const changed = settings.filter((definition) => values[definition.id] !== official[definition.id]).length
  // Not every group needs one.
  const hintKey = `hint.${group.id}`
  const hint = hasMessage(hintKey) ? t(hintKey) : null

  const setAll = (value: number): void => props.onChange(Object.fromEntries(settings.map((definition) => [definition.id, value])))
  const setPercent = (percent: number): void =>
    props.onChange(
      Object.fromEntries(
        settings.map((definition) => [
          definition.id,
          Number.isFinite(percent) ? Math.round((official[definition.id]! * percent) / 100) : Number.NaN
        ])
      )
    )

  let globalField: React.JSX.Element | null = null
  if (group.globalField === 'same-value') {
    globalField = (
      <NumberInput
        label={`${title} — ${t('settings.all')}`}
        definition={settings[0]!}
        value={sharedValue(settings, values)}
        placeholder={t('settings.mixed')}
        onChange={setAll}
      />
    )
  } else if (group.globalField === 'percent-of-official') {
    globalField = (
      <NumberInput
        label={`${title} — ${t('settings.all')}`}
        definition={{ id: `${group.id}.percent`, key: '', kind: 'percent' }}
        value={sharedPercent(settings, values, official)}
        placeholder={t('settings.mixed')}
        onChange={setPercent}
      />
    )
  }

  return (
    <section className="setting-group" data-testid={`group-${group.id}`}>
      <div className="group-header">
        <button type="button" className="group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {title}
        </button>
        {changed > 0 && <span className="group-changed">{t('settings.changed', { count: changed })}</span>}
        {globalField && (
          <span className="group-global">
            <span className="muted-inline">{t('settings.all')}</span>
            {globalField}
          </span>
        )}
      </div>
      {open && (
        <div className="group-body">
          {hint && <p className="hint">{hint}</p>}
          {settings.map((definition) => {
            const value = values[definition.id]!
            const label = `${title} — ${t(settingLabel(definition))}`
            const modified = value !== official[definition.id]
            return (
              <div key={definition.id} className={modified ? 'setting-row modified' : 'setting-row'}>
                <span className="setting-label">{t(settingLabel(definition))}</span>
                {definition.kind === 'toggle' ? (
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={value === 1}
                    onChange={(event) => props.onChange({ [definition.id]: event.currentTarget.checked ? 1 : 0 })}
                  />
                ) : (
                  <span className="setting-control">
                    <NumberInput
                      label={label}
                      definition={definition}
                      value={value}
                      onChange={(next) => props.onChange({ [definition.id]: next })}
                    />
                    {definition.kind === 'points' && <span className="muted-inline">{t('settings.pointsPerDay')}</span>}
                    <span className="official">{t('settings.officialValue', { value: formatOfficial(definition, official[definition.id]!) })}</span>
                  </span>
                )}
              </div>
            )
          })}
          <button type="button" className="small" onClick={() => props.onChange(Object.fromEntries(settings.map((d) => [d.id, official[d.id]!])))}>
            {t('settings.official')}
          </button>
        </div>
      )}
    </section>
  )
}

export function SettingsPage({ state }: { state: LauncherState }): React.JSX.Element {
  const { t } = useI18n()
  const [settings, setSettings] = useState<ServerSettings | null>(null)
  const [values, setValues] = useState<Values>({})
  const [feedback, setFeedback] = useState<Feedback>(null)
  const serverRoot = state.install.serverFound ? state.install.serverRoot : null

  useEffect(() => {
    setSettings(null)
    if (serverRoot) {
      void window.launcher.getServerSettings().then((loaded) => {
        setSettings(loaded)
        setValues(loaded?.values ?? {})
      })
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

  const definitions = SETTING_GROUPS.flatMap((group) => group.settings).filter((definition) => settings.official[definition.id] !== undefined)
  // Only what was changed here is sent: a setting the page cannot show as it is (a premium rate of its own, the reservation mode) stays as
  // the file has it unless the person changes it.
  const edited = Object.fromEntries(definitions.filter((d) => values[d.id] !== settings.values[d.id]).map((d) => [d.id, values[d.id]!]))
  const dirty = Object.keys(edited).length > 0
  const valid = definitions.every((definition) => isAllowed(definition, values[definition.id]))

  const change = (changes: Values): void => {
    setValues({ ...values, ...changes })
    setFeedback(null)
  }
  const save = async (): Promise<void> => {
    const saved = await window.launcher.saveServerSettings(edited)
    if (saved) {
      setSettings({ ...settings, values: { ...settings.values, ...edited } })
    }
    setFeedback(saved ? 'saved' : 'failed')
  }

  return (
    <section className="panel settings-page" aria-labelledby="settings-title">
      <h2 id="settings-title">{t('nav.settings')}</h2>
      <p className="muted">{t('settings.intro')}</p>

      {SETTING_GROUPS.map((group) => (
        <GroupView key={group.id} group={group} values={values} official={settings.official} onChange={change} />
      ))}

      <div className="actions">
        <button type="button" onClick={() => change(settings.official)}>
          {t('settings.allOfficial')}
        </button>
        {dirty && (
          <span className="unsaved" data-testid="unsaved">
            {t('settings.unsaved')}
          </span>
        )}
        <button type="button" className="button-primary" disabled={!valid || !dirty} onClick={() => void save()}>
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

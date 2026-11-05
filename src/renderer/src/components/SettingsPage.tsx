import { useEffect, useState } from 'react'
import {
  isAllowed,
  limitsOf,
  pageOf,
  SETTING_GROUPS,
  type ServerSettings,
  type SettingDefinition,
  type SettingGroup,
  type SettingPage
} from '../../../shared/settingsCatalog'
import type { LauncherState } from '../../../shared/types'
import { hasMessage, useI18n, type MessageKey } from '../i18n'

type Values = Record<string, number>
type Feedback = 'saved' | 'failed' | null
type Translate = ReturnType<typeof useI18n>['t']

// The labels of the catalog: checked to exist in every language by a unit test, so the cast only spares the type system a template literal.
const groupLabel = (group: SettingGroup): MessageKey => `group.${group.id}` as MessageKey
const settingLabel = (definition: SettingDefinition): MessageKey => `setting.${definition.id}` as MessageKey

const isSwitch = (definition: SettingDefinition): boolean => definition.kind === 'toggle' || definition.kind === 'flag'

/** What follows a field: a percent sign, a unit word, or for the daily Glory Point loss, "a day". */
function unitOf(definition: SettingDefinition, t: Translate): string | null {
  if (definition.kind === 'percent' || definition.unit === 'percent') {
    return '%'
  }
  if (definition.unit) {
    return t(`unit.${definition.unit}` as MessageKey)
  }
  return definition.kind === 'points' ? t('settings.perDay') : null
}

function formatOfficial(definition: SettingDefinition, value: number, t: Translate): string {
  switch (definition.kind) {
    case 'multiplier':
      return `x${value}`
    case 'choice':
      return definition.options?.[value] ?? String(value)
    case 'toggle':
    case 'flag':
      return t(value === 1 ? 'settings.on' : 'settings.off')
    case 'points':
      return String(value)
    default: {
      const unit = unitOf(definition, t)
      return unit ? `${value.toLocaleString()} ${unit}` : value.toLocaleString()
    }
  }
}

function NumberInput(props: {
  label: string
  definition: SettingDefinition
  value: number | null
  placeholder?: string
  unit?: string | null
  onChange: (value: number) => void
}): React.JSX.Element {
  const { definition } = props
  const limits = limitsOf(definition)
  const prefix = definition.kind === 'multiplier' ? 'x' : null
  const suffix = props.unit ?? null
  return (
    <span className="value-input">
      {prefix && (
        <span className="affix" aria-hidden="true">
          {prefix}
        </span>
      )}
      <input
        type="number"
        aria-label={props.label}
        min={limits.min}
        max={limits.max}
        step={definition.kind === 'multiplier' ? 0.5 : 1}
        value={props.value === null || Number.isNaN(props.value) ? '' : props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.valueAsNumber)}
      />
      {suffix && (
        <span className="affix" aria-hidden="true">
          {suffix}
        </span>
      )}
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

function GroupPanel(props: {
  group: SettingGroup
  settings: SettingDefinition[]
  values: Values
  official: Values
  changed: number
  onChange: (changes: Values) => void
}): React.JSX.Element {
  const { t } = useI18n()
  const { group, settings, values, official } = props
  const title = t(groupLabel(group))
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
  const resetGroup = (): void => props.onChange(Object.fromEntries(settings.map((definition) => [definition.id, official[definition.id]!])))

  let globalField: React.JSX.Element | null = null
  if (group.globalField === 'same-value') {
    globalField = (
      <NumberInput
        label={`${title} — ${t('settings.all')}`}
        definition={settings[0]!}
        value={sharedValue(settings, values)}
        placeholder={t('settings.mixed')}
        unit={unitOf(settings[0]!, t)}
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
        unit="%"
        onChange={setPercent}
      />
    )
  }

  return (
    <div className="group-panel" role="tabpanel" aria-label={title} data-testid={`group-${group.id}`}>
      <div className="group-panel-header">
        <div>
          <h3>{title}</h3>
          {props.changed > 0 && <span className="group-changed">{t('settings.changed', { count: props.changed })}</span>}
        </div>
        <button type="button" className="small" disabled={props.changed === 0} onClick={resetGroup}>
          {t('settings.official')}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}

      <div className="setting-table">
        {globalField && (
          <div className="setting-row setting-row-all">
            <span className="setting-label">{t('settings.allOfGroup')}</span>
            {globalField}
            <span className="official" />
          </div>
        )}
        {settings.map((definition) => {
          const value = values[definition.id]!
          const label = `${title} — ${t(settingLabel(definition))}`
          const modified = value !== official[definition.id]
          return (
            <div key={definition.id} className={modified ? 'setting-row modified' : 'setting-row'}>
              <span className="setting-label">{t(settingLabel(definition))}</span>
              {isSwitch(definition) ? (
                <span className="toggle-cell">
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={value === 1}
                    onChange={(event) => props.onChange({ [definition.id]: event.currentTarget.checked ? 1 : 0 })}
                  />
                </span>
              ) : definition.kind === 'choice' ? (
                <select aria-label={label} value={value} onChange={(event) => props.onChange({ [definition.id]: Number(event.currentTarget.value) })}>
                  {(definition.options ?? []).map((option, index) => (
                    <option key={option} value={index}>
                      {hasMessage(`option.${definition.id}.${option}`) ? t(`option.${definition.id}.${option}` as MessageKey) : option}
                    </option>
                  ))}
                </select>
              ) : (
                <NumberInput
                  label={label}
                  definition={definition}
                  value={value}
                  unit={unitOf(definition, t)}
                  onChange={(next) => props.onChange({ [definition.id]: next })}
                />
              )}
              <span className="official">
                {definition.kind === 'toggle'
                  ? ''
                  : t('settings.officialValue', { value: formatOfficial(definition, official[definition.id]!, t) })}
                {definition.startOnly && <span className="start-only">{t('settings.startOnly')}</span>}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const PAGE_TEXT: Record<SettingPage, { title: MessageKey; intro: MessageKey }> = {
  server: { title: 'nav.settings', intro: 'settings.intro' },
  bots: { title: 'bots.settings', intro: 'bots.settingsIntro' }
}

/** The settings of one page of the catalog: the server's on their own page, the bots' under the bot list. */
export function SettingsPage({ state, page = 'server' }: { state: LauncherState; page?: SettingPage }): React.JSX.Element {
  const { t } = useI18n()
  const [settings, setSettings] = useState<ServerSettings | null>(null)
  const [values, setValues] = useState<Values>({})
  const [feedback, setFeedback] = useState<Feedback>(null)
  const pageGroups = SETTING_GROUPS.filter((group) => pageOf(group) === page)
  const [selected, setSelected] = useState(pageGroups[0]!.id)
  const text = PAGE_TEXT[page]
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
        <h2>{t(text.title)}</h2>
        <p className="muted">{t('settings.noServer')}</p>
      </section>
    )
  }
  if (!settings) {
    return <section className="panel settings-page" aria-busy="true" />
  }

  // Only what this server's files have: a server older than the bot options has none of them.
  const groups = pageGroups.map((group) => ({
    group,
    settings: group.settings.filter((definition) => settings.official[definition.id] !== undefined)
  })).filter((entry) => entry.settings.length > 0)
  if (groups.length === 0) {
    return (
      <section className="panel settings-page">
        <h2>{t(text.title)}</h2>
        <p className="muted">{t('settings.noneOnServer')}</p>
      </section>
    )
  }
  const definitions = groups.flatMap((entry) => entry.settings)
  const changedIn = (list: SettingDefinition[]): number => list.filter((d) => values[d.id] !== settings.official[d.id]).length

  // Only what was changed here is sent: a setting the page cannot show as it is (a premium rate of its own, the reservation mode) stays as
  // the file has it unless the person changes it.
  const edited = Object.fromEntries(definitions.filter((d) => values[d.id] !== settings.values[d.id]).map((d) => [d.id, values[d.id]!]))
  const dirty = Object.keys(edited).length > 0
  const valid = definitions.every((definition) => isAllowed(definition, values[definition.id]))
  const current = groups.find((entry) => entry.group.id === selected) ?? groups[0]!

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
    <section className="panel settings-page" aria-labelledby={`settings-title-${page}`} data-testid={`settings-${page}`}>
      <header className="settings-header">
        <h2 id={`settings-title-${page}`}>{t(text.title)}</h2>
        <p className="muted">{t(text.intro)}</p>
      </header>

      <div className="settings-layout">
        <div className="group-list" role="tablist" aria-orientation="vertical" aria-label={t(text.title)}>
          {groups.map(({ group, settings: list }) => {
            const changed = changedIn(list)
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={group.id === current.group.id}
                onClick={() => setSelected(group.id)}
              >
                <span>{t(groupLabel(group))}</span>
                {changed > 0 && (
                  <span className="badge" aria-label={t('settings.changed', { count: changed })}>
                    {changed}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <GroupPanel
          key={current.group.id}
          group={current.group}
          settings={current.settings}
          values={values}
          official={settings.official}
          changed={changedIn(current.settings)}
          onChange={change}
        />
      </div>

      <div className="save-bar">
        <span className="save-state">
          {feedback === 'saved' && !dirty && (
            <span className="success" role="status">
              {t('settings.saved')}
            </span>
          )}
          {feedback === 'failed' && (
            <span className="problem" role="alert">
              {t('settings.saveFailed')}
            </span>
          )}
          {dirty && feedback !== 'failed' && (
            <span className="unsaved" data-testid="unsaved">
              {t('settings.unsaved')}
            </span>
          )}
        </span>
        <button type="button" onClick={() => change(settings.official)}>
          {t('settings.allOfficial')}
        </button>
        <button type="button" className="button-primary" disabled={!valid || !dirty} onClick={() => void save()}>
          {t('settings.save')}
        </button>
      </div>
    </section>
  )
}

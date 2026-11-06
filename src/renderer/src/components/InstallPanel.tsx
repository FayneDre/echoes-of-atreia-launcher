import { useState } from 'react'
import { REQUIRED_JAVA, SERVER_IDS, type LauncherState } from '../../../shared/types'
import { useI18n } from '../i18n'

function FolderRow(props: {
  label: string
  path: string | null
  found: boolean
  disabled: boolean
  testId: string
  onChoose: () => void
}): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="install-row" data-testid={props.testId} data-found={props.found}>
      <span className="install-label">{props.label}</span>
      <span className={props.found ? 'install-value' : 'install-value missing'}>
        {props.path ?? t('install.notSet')}
        {props.path && !props.found && ` — ${t('install.notFound')}`}
      </span>
      <button type="button" className="small" disabled={props.disabled} onClick={props.onChoose}>
        {t('action.choose')}
      </button>
    </div>
  )
}

export function InstallPanel({ state }: { state: LauncherState }): React.JSX.Element {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const { install } = state
  // The folders can only change while nothing runs: the running servers belong to the current one.
  const locked =
    state.activity !== 'idle' || SERVER_IDS.some((id) => state.servers[id].status !== 'stopped' && state.servers[id].status !== 'failed')
  const java = install.javaVersion

  if (state.activity === 'detecting') {
    return (
      <section className="panel" aria-labelledby="install-title">
        <h2 id="install-title">{t('section.install')}</h2>
        <p className="install-detecting" data-testid="install-detecting">
          {t('install.detecting')}
        </p>
      </section>
    )
  }

  const javaOk = java !== null && java >= REQUIRED_JAVA
  const allFound = install.serverFound && install.clientFound && javaOk
  // Set once and rarely looked at again: one line of checks, unfolded by a click, or by itself while something is missing.
  const unfolded = open || !allFound
  const check = (ok: boolean, label: string): React.JSX.Element => (
    <span className={ok ? 'check ok' : 'check missing'}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {label}
    </span>
  )

  return (
    <section className="panel install-panel" aria-labelledby="install-title">
      <h2 id="install-title">{t('section.install')}</h2>
      <button type="button" className="install-summary" data-testid="install-summary" aria-expanded={unfolded} disabled={!allFound} onClick={() => setOpen(!open)}>
        {check(install.serverFound, t('install.server'))}
        {check(install.clientFound, t('install.client'))}
        {check(javaOk, java !== null ? t('install.javaVersion', { version: java }) : t('install.java'))}
        <span className="chevron" aria-hidden="true">
          {unfolded ? '▾' : '▸'}
        </span>
      </button>
      <div hidden={!unfolded} className="install-rows">
      <FolderRow
        label={t('install.server')}
        path={install.serverRoot}
        found={install.serverFound}
        disabled={locked}
        testId="install-server"
        onChoose={() => void window.launcher.chooseFolder('server')}
      />
      <FolderRow
        label={t('install.client')}
        path={install.clientRoot}
        found={install.clientFound}
        disabled={locked}
        testId="install-client"
        onChoose={() => void window.launcher.chooseFolder('client')}
      />
      <div className="install-row" data-testid="install-java">
        <span className="install-label">{t('install.java')}</span>
        <span className={java !== null && java >= REQUIRED_JAVA ? 'install-value' : 'install-value missing'}>
          {java === null
            ? t('install.notFound')
            : java >= REQUIRED_JAVA
              ? t('install.javaVersion', { version: java })
              : t('install.javaTooOld', { version: java })}
        </span>
      </div>
      </div>
    </section>
  )
}

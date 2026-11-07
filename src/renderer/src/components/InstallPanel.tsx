import { useRef } from 'react'
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

/**
 * Set once and rarely looked at again: one line of checks on the page, whatever its state, so the home page never moves; the folders and
 * Java are in a dialog that line opens.
 */
export function InstallPanel({ state }: { state: LauncherState }): React.JSX.Element {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const { install } = state
  // The folders can only change while nothing runs: the running servers belong to the current one.
  const locked =
    state.activity !== 'idle' || SERVER_IDS.some((id) => state.servers[id].status !== 'stopped' && state.servers[id].status !== 'failed')
  const java = install.javaVersion

  if (state.activity === 'detecting') {
    return (
      <section className="panel install-panel" aria-labelledby="install-title">
        <h2 id="install-title">{t('section.install')}</h2>
        <p className="install-detecting" data-testid="install-detecting">
          {t('install.detecting')}
        </p>
      </section>
    )
  }

  const javaOk = java !== null && java >= REQUIRED_JAVA
  const allFound = install.serverFound && install.clientFound && javaOk
  const check = (ok: boolean, label: string): React.JSX.Element => (
    <span className={ok ? 'check ok' : 'check missing'}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {label}
    </span>
  )

  return (
    <section className="panel install-panel" aria-labelledby="install-title">
      <h2 id="install-title">{t('section.install')}</h2>
      <button
        type="button"
        className="install-summary"
        data-testid="install-summary"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {check(install.serverFound, t('install.server'))}
        {check(install.clientFound, t('install.client'))}
        {check(javaOk, java !== null ? t('install.javaVersion', { version: java }) : t('install.java'))}
        <span className={allFound ? 'install-edit' : 'install-edit install-fix'}>{t(allFound ? 'install.edit' : 'install.fix')}</span>
      </button>
      {/* always there, closed: what the rows say is read the same way whether it is open or not */}
      <dialog
        ref={dialog}
        className="dialog install-dialog"
        aria-labelledby="install-dialog-title"
        data-testid="install-dialog"
        onClick={(event) => {
          if (event.target === dialog.current) {
            dialog.current.close()
          }
        }}
      >
        <h2 id="install-dialog-title">{t('section.install')}</h2>
        {locked && <p className="muted">{t('install.locked')}</p>}
        <div className="install-rows">
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
            <span className={javaOk ? 'install-value' : 'install-value missing'}>
              {java === null
                ? t('install.notFound')
                : javaOk
                  ? t('install.javaVersion', { version: java })
                  : t('install.javaTooOld', { version: java })}
            </span>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
            {t('action.close')}
          </button>
        </div>
      </dialog>
    </section>
  )
}

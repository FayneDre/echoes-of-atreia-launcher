import { useRef, useState } from 'react'
import {
  CLIENT_LANGUAGE_NAMES,
  LOW_DISK_BYTES,
  REQUIRED_JAVA,
  SERVER_IDS,
  type HomeInfo,
  type LauncherState,
  type SystemOption,
  type SystemOptions
} from '../../../shared/types'
import { formatSize } from '../format'
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

/** One option of the installation's window: a box, its name, and what it does. Disabled with a reason when this launcher cannot offer it. */
function OptionRow(props: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  testId: string
  onChange: (on: boolean) => void
}): React.JSX.Element {
  return (
    <label className="install-option" data-testid={props.testId}>
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.target.checked)} />
      <span>
        <strong>{props.label}</strong>
        {props.hint && <span className="muted">{props.hint}</span>}
      </span>
    </label>
  )
}

/**
 * Set once and rarely looked at again: one line of checks on the page, whatever its state, so the home page never moves; the folders and
 * Java are in a dialog that line opens. Below, what the install takes: the drive's free space, the backups, the database.
 */
export function InstallPanel(props: { state: LauncherState; info: HomeInfo | null; onOpenBackups: () => void }): React.JSX.Element {
  const { state, info } = props
  const { language, t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  // what Windows has now, read each time the window opens: the person may have changed it there
  const [system, setSystem] = useState<SystemOptions>({ startWithWindows: null, desktopShortcut: null })
  const openDialog = (): void => {
    dialog.current?.showModal()
    void window.launcher.getSystemOptions().then(setSystem)
  }
  const setSystemOption = (option: SystemOption, on: boolean): void => {
    // the box moves at once; Windows' answer then says what it really holds
    setSystem({ ...system, [option]: on })
    void window.launcher.setSystemOption(option, on).then(setSystem)
  }
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
  // a client folder is ready when nothing it needs is missing and one of its languages can start
  const clientOk = install.clientFound && install.clientMissing.length === 0 && install.clientLanguage !== null
  const allFound = install.serverFound && clientOk && javaOk
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
        onClick={openDialog}
      >
        {check(install.serverFound, t('install.server'))}
        {check(clientOk, t('install.client'))}
        {check(javaOk, java !== null ? t('install.javaVersion', { version: java }) : t('install.java'))}
        <span className={allFound ? 'install-edit' : 'install-edit install-fix'}>{t(allFound ? 'install.edit' : 'install.fix')}</span>
      </button>
      <dl className="install-facts">
        <div className={info?.disk && info.disk.freeBytes < LOW_DISK_BYTES ? 'fact fact-low' : 'fact'}>
          <dt>{t('install.disk')}</dt>
          <dd data-testid="install-disk" title={info?.disk && info.disk.freeBytes < LOW_DISK_BYTES ? t('install.lowDisk') : undefined}>
            {info?.disk ? t('install.diskValue', { drive: info.disk.drive, size: formatSize(info.disk.freeBytes, language) }) : '—'}
          </dd>
        </div>
        <div className="fact">
          <dt>{t('install.backups')}</dt>
          <dd data-testid="install-backups">
            {info ? (
              <button type="button" className="link install-fact-link" onClick={props.onOpenBackups}>
                {info.backups.count === 0
                  ? t('install.noBackups')
                  : t('install.backupsValue', { count: info.backups.count, size: formatSize(info.backups.bytes, language) })}
              </button>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="fact">
          <dt>{t('install.database')}</dt>
          <dd data-testid="install-database">
            {info?.database
              ? t('install.databaseValue', { size: formatSize(info.database.bytes, language), version: info.database.mysqlVersion })
              : '—'}
          </dd>
        </div>
      </dl>
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
          {install.clientFound && (
            <div className="install-row install-client-check" data-testid="install-client-language">
              <span className="install-label">{t('install.clientLanguage')}</span>
              <span className="install-value">
                {install.clientPacks.some((pack) => pack.complete) ? (
                  <select
                    value={install.clientLanguage ?? ''}
                    aria-label={t('install.clientLanguage')}
                    onChange={(event) => void window.launcher.setClientLanguage(event.currentTarget.value)}
                  >
                    {install.clientPacks
                      .filter((pack) => pack.complete)
                      .map((pack) => (
                        <option key={pack.code} value={pack.code}>
                          {CLIENT_LANGUAGE_NAMES[pack.code]}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span className="missing">{t('install.noLanguagePack')}</span>
                )}
                {install.clientMissing.length > 0 && (
                  <span className="missing install-client-note" data-testid="install-client-missing">
                    {t('install.clientMissing', { files: install.clientMissing.join(', ') })}
                  </span>
                )}
                {install.clientPacks
                  .filter((pack) => !pack.complete || pack.missingFiles > 0)
                  .map((pack) => (
                    <span key={pack.code} className={pack.complete ? 'muted install-client-note' : 'missing install-client-note'}>
                      {pack.complete
                        ? t('install.packPartial', { language: CLIENT_LANGUAGE_NAMES[pack.code], count: pack.missingFiles })
                        : t('install.packBroken', { language: CLIENT_LANGUAGE_NAMES[pack.code], code: pack.code.toLowerCase() })}
                    </span>
                  ))}
              </span>
              <button type="button" className="small" data-testid="install-check-client" onClick={() => void window.launcher.checkClient()}>
                {t('install.checkClient')}
              </button>
            </div>
          )}
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
        <h3 className="install-options-title">{t('install.options')}</h3>
        <div className="install-options">
          <OptionRow
            label={t('install.startServers')}
            checked={state.startServersOnLaunch}
            testId="option-start-servers"
            onChange={(on) => void window.launcher.setStartServersOnLaunch(on)}
          />
          <OptionRow
            label={t('install.cleanup')}
            hint={
              state.lastCleanup && state.lastCleanup.files > 0
                ? t('install.cleanupDone', { count: state.lastCleanup.files, size: formatSize(state.lastCleanup.bytes, language) })
                : t('install.cleanupHint')
            }
            checked={state.autoCleanup}
            testId="option-cleanup"
            onChange={(on) => void window.launcher.setAutoCleanup(on)}
          />
          <OptionRow
            label={t('install.startWithWindows')}
            hint={system.startWithWindows === null ? t('install.installedOnly') : undefined}
            checked={system.startWithWindows === true}
            disabled={system.startWithWindows === null}
            testId="option-start-with-windows"
            onChange={(on) => setSystemOption('startWithWindows', on)}
          />
          <OptionRow
            label={t('install.desktopShortcut')}
            hint={system.desktopShortcut === null ? t('install.installedOnly') : undefined}
            checked={system.desktopShortcut === true}
            disabled={system.desktopShortcut === null}
            testId="option-desktop-shortcut"
            onChange={(on) => setSystemOption('desktopShortcut', on)}
          />
          <OptionRow
            label={t('install.developer')}
            hint={t('install.developerHint')}
            checked={state.developerMode}
            testId="option-developer"
            onChange={(on) => void window.launcher.setDeveloperMode(on)}
          />
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

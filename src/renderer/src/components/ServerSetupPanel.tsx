import { useRef } from 'react'
import type { LauncherState, ServerSetupState } from '../../../shared/types'
import { closeOnBackdropClick } from '../dialog'
import { useI18n, type MessageKey } from '../i18n'
import { ProblemText } from './ProblemText'

interface Props {
  setup: ServerSetupState | null
  state: LauncherState
}

/**
 * The install from nothing, offered while no server is found. On the home page it takes a few lines whatever its state, so the page never
 * scrolls: what the install takes and the folder it wants are in a dialog the button opens, a long failure's details in another; then each
 * step as it runs, and a try again that goes back to the same folder (what was downloaded and checked is kept).
 */
export function ServerSetupPanel({ setup, state }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const running = setup?.status === 'running'
  if (!setup || state.activity === 'detecting' || (state.install.serverFound && !running)) {
    return null
  }
  const idle = state.activity === 'idle'
  const chooseFolder = (): void => {
    dialog.current?.close()
    void window.launcher.installServer()
  }
  const where = [setup.folder ? t('serverSetup.into', { folder: setup.folder }) : null, setup.version ? t('serverSetup.version', { version: setup.version }) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="panel" aria-labelledby="server-setup-title" data-testid="server-setup" data-status={setup.status}>
      <h2 id="server-setup-title">{t('section.serverSetup')}</h2>
      {setup.status === 'idle' && (
        <>
          <p>{t('serverSetup.short')}</p>
          <div className="server-update-row">
            <button type="button" disabled={!idle} aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
              {t('serverSetup.install')}
            </button>
          </div>
        </>
      )}

      {setup.status !== 'idle' && where && (
        <p className="muted" data-testid="server-setup-folder">
          {where}
        </p>
      )}

      {running && setup.step && (
        <p role="status" data-testid="server-setup-step">
          {t(`serverSetup.step.${setup.step}` as MessageKey, { percent: setup.percent ?? 0 })}
        </p>
      )}

      {setup.status === 'failed' && (
        <>
          <div data-testid="server-setup-problem">
            <ProblemText problem={setup.problem} detailsInDialog />
          </div>
          <div className="server-update-row">
            <button type="button" disabled={!idle} onClick={() => void window.launcher.installServer(true)}>
              {t('serverSetup.retry')}
            </button>
            <button type="button" className="secondary" disabled={!idle} onClick={() => void window.launcher.installServer()}>
              {t('serverSetup.other')}
            </button>
          </div>
        </>
      )}

      {/* always there, closed: what the install takes, read before choosing where it goes */}
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="server-setup-dialog-title"
        data-testid="server-setup-dialog"
        onClick={closeOnBackdropClick}
      >
        <h2 id="server-setup-dialog-title">{t('section.serverSetup')}</h2>
        <p>{t('serverSetup.intro')}</p>
        <p className="muted">{t('serverSetup.size')}</p>
        <p className="muted">{t('serverSetup.folderNote')}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
            {t('action.cancel')}
          </button>
          <button type="button" className="button-primary" disabled={!idle} onClick={chooseFolder}>
            {t('serverSetup.chooseFolder')}
          </button>
        </div>
      </dialog>
    </section>
  )
}

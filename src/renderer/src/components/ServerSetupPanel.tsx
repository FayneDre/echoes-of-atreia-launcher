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
 * The install from nothing, offered while no server is found. On the home page it is one line and one button whatever its state, so the page
 * never scrolls; everything else is in a dialog that button opens and that stays open while the install runs: what the install takes and the
 * folder it wants, then each step as it runs, then a failure with a try again that goes back to the same folder (what was downloaded and
 * checked is kept), or another folder.
 */
export function ServerSetupPanel({ setup, state }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const running = setup?.status === 'running'
  if (!setup || state.activity === 'detecting' || (state.install.serverFound && !running)) {
    return null
  }
  const idle = state.activity === 'idle'
  const where = [setup.folder ? t('serverSetup.into', { folder: setup.folder }) : null, setup.version ? t('serverSetup.version', { version: setup.version }) : null]
    .filter(Boolean)
    .join(' · ')
  const summary: MessageKey = running ? 'serverSetup.runningShort' : setup.status === 'failed' ? 'serverSetup.failedShort' : 'serverSetup.short'
  const open: MessageKey = setup.status === 'idle' ? 'serverSetup.install' : 'serverSetup.follow'

  return (
    <section className="panel" aria-labelledby="server-setup-title" data-testid="server-setup" data-status={setup.status}>
      <h2 id="server-setup-title">{t('section.serverSetup')}</h2>
      {/* the sentence and its button side by side: below it, the button took the height the news need beside an install to make */}
      <div className="server-setup-row">
        <p className={setup.status === 'failed' ? 'missing' : undefined} role={running ? 'status' : undefined}>
          {t(summary)}
        </p>
        <button type="button" aria-haspopup="dialog" disabled={setup.status === 'idle' && !idle} onClick={() => dialog.current?.showModal()}>
          {t(open)}
        </button>
      </div>

      {/* always there, closed until asked for: what the install takes, then how it goes */}
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="server-setup-dialog-title"
        data-testid="server-setup-dialog"
        onClick={closeOnBackdropClick}
      >
        <h2 id="server-setup-dialog-title">{t('section.serverSetup')}</h2>
        {setup.status === 'idle' ? (
          <>
            <p>{t('serverSetup.intro')}</p>
            <p className="muted">{t('serverSetup.size')}</p>
            <p className="muted">{t('serverSetup.folderNote')}</p>
          </>
        ) : (
          where && (
            <p className="muted" data-testid="server-setup-folder">
              {where}
            </p>
          )
        )}

        {running && setup.step && (
          <p role="status" data-testid="server-setup-step">
            {t(`serverSetup.step.${setup.step}` as MessageKey, { percent: setup.percent ?? 0 })}
          </p>
        )}
        {running && setup.detail && (
          <p className="muted" data-testid="server-setup-detail">
            {setup.detail}
          </p>
        )}

        {setup.status === 'failed' && (
          <div data-testid="server-setup-problem">
            <ProblemText problem={setup.problem} />
          </div>
        )}

        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
            {t(setup.status === 'idle' ? 'action.cancel' : 'action.close')}
          </button>
          {setup.status === 'idle' && (
            <button type="button" className="button-primary" disabled={!idle} onClick={() => void window.launcher.installServer()}>
              {t('serverSetup.chooseFolder')}
            </button>
          )}
          {setup.status === 'failed' && (
            <>
              <button type="button" className="secondary" disabled={!idle} onClick={() => void window.launcher.installServer()}>
                {t('serverSetup.other')}
              </button>
              <button type="button" className="button-primary" disabled={!idle} onClick={() => void window.launcher.installServer(true)}>
                {t('serverSetup.retry')}
              </button>
            </>
          )}
        </div>
      </dialog>
    </section>
  )
}

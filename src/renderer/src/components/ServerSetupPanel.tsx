import type { LauncherState, ServerSetupState } from '../../../shared/types'
import { useI18n, type MessageKey } from '../i18n'
import { ProblemText } from './ProblemText'

interface Props {
  setup: ServerSetupState | null
  state: LauncherState
}

/**
 * The install from nothing, offered while no server is found: what it takes, a folder to choose, then each step as it runs, and a try again
 * that goes back to the same folder (what was downloaded and checked is kept).
 */
export function ServerSetupPanel({ setup, state }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const running = setup?.status === 'running'
  if (!setup || state.activity === 'detecting' || (state.install.serverFound && !running)) {
    return null
  }
  const idle = state.activity === 'idle'

  return (
    <section className="panel" aria-labelledby="server-setup-title" data-testid="server-setup" data-status={setup.status}>
      <h2 id="server-setup-title">{t('section.serverSetup')}</h2>
      {setup.status === 'idle' && (
        <>
          <p>{t('serverSetup.intro')}</p>
          <p className="muted">{t('serverSetup.size')}</p>
          <p className="muted">{t('serverSetup.folderNote')}</p>
          <div className="server-update-row">
            <button type="button" disabled={!idle} onClick={() => void window.launcher.installServer()}>
              {t('serverSetup.install')}
            </button>
          </div>
        </>
      )}

      {setup.status !== 'idle' && setup.folder && <p data-testid="server-setup-folder">{t('serverSetup.into', { folder: setup.folder })}</p>}
      {setup.status !== 'idle' && setup.version && <p className="muted">{t('serverSetup.version', { version: setup.version })}</p>}

      {running && setup.step && (
        <p role="status" data-testid="server-setup-step">
          {t(`serverSetup.step.${setup.step}` as MessageKey, { percent: setup.percent ?? 0 })}
        </p>
      )}

      {setup.status === 'failed' && (
        <>
          <div data-testid="server-setup-problem">
            <ProblemText problem={setup.problem} />
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
    </section>
  )
}

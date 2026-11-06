import type { LauncherState, ServerUpdateState } from '../../../shared/types'
import { useI18n, type MessageKey } from '../i18n'
import { ProblemText } from './ProblemText'

interface Props {
  update: ServerUpdateState | null
  state: LauncherState
}

/**
 * The server's own update: the release installed, a newer one with its notes, then what the update will do (default files edited by hand
 * kept, a database that never went through the SQL script) before the person says yes, the steps while it runs, and a way back.
 */
export function ServerUpdatePanel({ update, state }: Props): React.JSX.Element | null {
  const { language, t } = useI18n()
  if (!update || state.activity === 'detecting' || !state.install.serverFound) {
    return null
  }
  const idle = state.activity === 'idle'
  const notes = update.available?.notes?.[language] ?? update.available?.notes?.en
  const installed = update.installed ?? t('serverUpdate.fromGit')

  return (
    <section className="panel" aria-labelledby="server-update-title" data-testid="server-update" data-status={update.status}>
      <h2 id="server-update-title">{t('section.serverUpdate')}</h2>
      {update.status === 'dev' ? (
        <p data-testid="server-update-dev">{t('serverUpdate.dev', { revision: update.revision ?? '?' })}</p>
      ) : (
        <p data-testid="server-update-installed">{t('serverUpdate.installed', { version: installed })}</p>
      )}
      {update.status === 'current' && <p>{t('serverUpdate.current')}</p>}

      {update.available && (update.status === 'available' || update.status === 'failed') && (
        <div className="server-update-row">
          <span>{t('serverUpdate.available', { version: update.available.version })}</span>
          <button type="button" disabled={!idle} onClick={() => void window.launcher.prepareServerUpdate()}>
            {t(update.status === 'failed' ? 'serverUpdate.retry' : 'serverUpdate.prepare')}
          </button>
        </div>
      )}

      {(update.status === 'preparing' || update.status === 'installing') && update.step && (
        <p role="status" data-testid="server-update-step">
          {t(`serverUpdate.step.${update.step}` as MessageKey, { percent: update.percent ?? 0 })}
        </p>
      )}

      {update.status === 'confirm' && update.available && (
        <div className="server-update-confirm" data-testid="server-update-confirm">
          <p>{t('serverUpdate.confirm', { version: update.available.version })}</p>
          {update.jdk && !update.jdk.ok && (
            <p className="missing" role="alert" data-testid="server-update-jdk">
              {t('serverUpdate.jdkMissing', { version: update.jdk.needed })}
            </p>
          )}
          {update.markApplied && <p data-testid="server-update-mark-applied">{t('serverUpdate.markApplied')}</p>}
          {update.keptLocal && update.keptLocal.length > 0 && (
            <>
              <p>{t('serverUpdate.keptLocal', { version: update.available.version })}</p>
              <ul className="server-update-files" data-testid="server-update-kept">
                {update.keptLocal.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
            </>
          )}
          <div className="server-update-row">
            <button type="button" disabled={!idle || !update.jdk?.ok} onClick={() => void window.launcher.installServerUpdate()}>
              {t('serverUpdate.install')}
            </button>
            <button type="button" className="secondary" onClick={() => void window.launcher.cancelServerUpdate()}>
              {t('action.cancel')}
            </button>
          </div>
        </div>
      )}

      {update.status === 'failed' && (
        <div data-testid="server-update-problem">
          <ProblemText problem={update.problem} />
        </div>
      )}

      {update.status === 'off' && update.problem && <p className="muted">{t('serverUpdate.offline')}</p>}

      {update.canReturnTo && update.status !== 'preparing' && update.status !== 'installing' && update.status !== 'confirm' && (
        <div className="server-update-row">
          <span className="muted">{t('serverUpdate.returnNote')}</span>
          <button type="button" className="secondary" disabled={!idle} onClick={() => void window.launcher.undoServerUpdate()}>
            {update.canReturnTo.version ? t('serverUpdate.return', { version: update.canReturnTo.version }) : t('serverUpdate.returnToGit')}
          </button>
        </div>
      )}

      {notes && update.available && update.status !== 'current' && (
        <details className="update-notes">
          <summary>{t('update.notes')}</summary>
          <pre data-testid="server-update-notes">{notes}</pre>
        </details>
      )}
    </section>
  )
}

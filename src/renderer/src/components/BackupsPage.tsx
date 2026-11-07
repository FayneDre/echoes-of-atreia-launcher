import { useCallback, useEffect, useState } from 'react'
import { SERVER_IDS, type BackupSummary, type LauncherState, type Problem } from '../../../shared/types'
import { formatSize } from '../format'
import { useI18n } from '../i18n'
import { ProblemText } from './ProblemText'

type Outcome = { done: 'created' | 'restored' } | { problem: Problem } | null

export function BackupsPage({ state, visible }: { state: LauncherState; visible: boolean }): React.JSX.Element {
  const { t, language } = useI18n()
  const [backups, setBackups] = useState<BackupSummary[] | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const serverFound = state.install.serverFound
  const busy = state.activity !== 'idle'
  const running = SERVER_IDS.some((id) => state.servers[id].status !== 'stopped' && state.servers[id].status !== 'failed')

  const reload = useCallback(async () => setBackups(await window.launcher.listBackups()), [])
  useEffect(() => {
    if (visible && serverFound) {
      void reload()
    }
  }, [visible, serverFound, state.install.serverRoot, reload])

  const formatDate = (iso: string): string => new Date(iso).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB')

  const create = async (): Promise<void> => {
    setOutcome(null)
    const problem = await window.launcher.createBackup()
    setOutcome(problem ? { problem } : { done: 'created' })
    await reload()
  }
  const restore = async (backup: BackupSummary): Promise<void> => {
    if (!window.confirm(t('backups.restoreConfirm', { date: formatDate(backup.createdAt) }))) {
      return
    }
    setOutcome(null)
    const problem = await window.launcher.restoreBackup(backup.id)
    setOutcome(problem ? { problem } : { done: 'restored' })
    await reload()
  }
  const remove = async (backup: BackupSummary): Promise<void> => {
    if (window.confirm(t('backups.removeConfirm', { date: formatDate(backup.createdAt) }))) {
      await window.launcher.removeBackup(backup.id)
      await reload()
    }
  }

  if (!serverFound) {
    return (
      <section className="panel settings-page">
        <h2>{t('nav.backups')}</h2>
        <p className="muted">{t('settings.noServer')}</p>
      </section>
    )
  }

  return (
    <section className="panel backups-page" aria-labelledby="backups-title">
      <header className="settings-header">
        <h2 id="backups-title">{t('nav.backups')}</h2>
        <p className="muted">{t('backups.intro')}</p>
      </header>

      <div className="backup-actions">
        <button type="button" className="button-primary" disabled={busy} onClick={() => void create()}>
          {t('backups.create')}
        </button>
        <button type="button" onClick={() => void window.launcher.openBackupFolder()}>
          {t('backups.openFolder')}
        </button>
        <span className="save-state" role="status">
          {state.activity === 'backup' && t('backups.creating')}
          {state.activity === 'restore' && t('backups.restoring')}
          {!busy && outcome && 'done' in outcome && (
            <span className="success">{t(outcome.done === 'created' ? 'backups.created' : 'backups.restored')}</span>
          )}
        </span>
      </div>
      {outcome && 'problem' in outcome && <ProblemText problem={outcome.problem} />}
      {running && <p className="hint">{t('backups.stopFirst')}</p>}

      {backups && backups.length === 0 && <p className="muted">{t('backups.none')}</p>}
      {backups && backups.length > 0 && (
        <ul className="backup-list">
          {backups.map((backup) => (
            <li key={backup.id} className="backup" data-testid={`backup-${backup.id}`}>
              <span className="backup-main">
                <span className="backup-date">{formatDate(backup.createdAt)}</span>
                <span className={backup.kind === 'manual' ? 'tag tag-manual' : 'tag tag-safety'}>{t(`backups.kind.${backup.kind}`)}</span>
              </span>
              <span className="backup-databases">
                {backup.databases.map((database) => `${database.name} ${formatSize(database.bytes, language)}`).join(' · ')}
              </span>
              <span className="header-actions">
                <button type="button" className="small" disabled={busy || running} onClick={() => void restore(backup)}>
                  {t('backups.restore')}
                </button>
                <button type="button" className="small button-danger" disabled={busy} onClick={() => void remove(backup)}>
                  {t('backups.remove')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

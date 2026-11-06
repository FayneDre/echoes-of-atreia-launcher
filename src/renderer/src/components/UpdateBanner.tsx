import type { LauncherState, UpdateState } from '../../../shared/types'
import { useI18n } from '../i18n'

interface Props {
  update: UpdateState | null
  state: LauncherState
}

/**
 * The launcher's own update: its download, then the version ready with its notes in the person's language and a button to install it now
 * (closing asks about running servers as any close does). The portable copy only points to the release.
 */
export function UpdateBanner({ update, state }: Props): React.JSX.Element | null {
  const { language, t } = useI18n()
  if (!update || !update.version || (update.status !== 'downloading' && update.status !== 'ready' && update.status !== 'portable')) {
    return null
  }
  const notes = update.notes?.[language] ?? update.notes?.en
  // a start or a stop under way is not interrupted by a close
  const busy = state.activity === 'starting' || state.activity === 'stopping' || state.activity === 'server-update'
  return (
    <div className="banner update-banner" role="status" data-testid="launcher-update" data-status={update.status}>
      {update.status === 'downloading' && <span>{t('update.downloading', { version: update.version, percent: update.percent ?? 0 })}</span>}
      {update.status === 'ready' && (
        <>
          <span>{t('update.ready', { version: update.version })}</span>
          <button type="button" disabled={busy} onClick={() => void window.launcher.installUpdate()}>
            {t('update.install')}
          </button>
        </>
      )}
      {update.status === 'portable' && (
        <>
          <span>{t('update.portable', { version: update.version })}</span>
          {update.releaseUrl && (
            <a href={update.releaseUrl} target="_blank" rel="noreferrer">
              {t('update.download')}
            </a>
          )}
        </>
      )}
      {notes && (
        <details className="update-notes">
          <summary>{t('update.notes')}</summary>
          <pre data-testid="launcher-update-notes">{notes}</pre>
        </details>
      )}
    </div>
  )
}

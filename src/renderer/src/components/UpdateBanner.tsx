import { useState } from 'react'
import type { LauncherState, UpdateState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { UpdateNotesDialog } from './UpdateNotesDialog'

interface Props {
  update: UpdateState | null
  state: LauncherState
}

/**
 * The launcher's own update, on one line above every page: a newer version is offered, downloads only once the person accepts it, then
 * waits for them to install it (closing asks about running servers as any close does). Its notes open over the page. "Later" hides the
 * offer until the next start. The portable copy only points to the release.
 */
export function UpdateBanner({ update, state }: Props): React.JSX.Element | null {
  const { language, t } = useI18n()
  const [reading, setReading] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  if (
    !update ||
    !update.version ||
    dismissed === update.version ||
    (update.status !== 'available' && update.status !== 'downloading' && update.status !== 'ready' && update.status !== 'portable')
  ) {
    return null
  }
  const version = update.version
  const notes = update.notes?.[language] ?? update.notes?.en
  // a start or a stop under way is not interrupted by a close
  const busy = state.activity === 'starting' || state.activity === 'stopping' || state.activity === 'server-update'
  return (
    <div className="banner update-banner" role="status" data-testid="launcher-update" data-status={update.status}>
      <span className="update-text">
        {update.status === 'available' && t('update.available', { version })}
        {update.status === 'downloading' && t('update.downloading', { version, percent: update.percent ?? 0 })}
        {update.status === 'ready' && t('update.ready', { version })}
        {update.status === 'portable' && t('update.portable', { version })}
      </span>
      {notes && (
        <button type="button" className="link" onClick={() => setReading(true)}>
          {t('update.notes')}
        </button>
      )}
      {update.status === 'available' && (
        <button type="button" className="small" onClick={() => void window.launcher.downloadUpdate()}>
          {t('update.accept')}
        </button>
      )}
      {update.status === 'ready' && (
        <button type="button" className="small" disabled={busy} onClick={() => void window.launcher.installUpdate()}>
          {t('update.install')}
        </button>
      )}
      {update.status === 'portable' && update.releaseUrl && (
        <a href={update.releaseUrl} target="_blank" rel="noreferrer">
          {t('update.download')}
        </a>
      )}
      {update.status !== 'downloading' && (
        <button type="button" className="small" onClick={() => setDismissed(version)}>
          {t('update.later')}
        </button>
      )}
      {reading && notes && <UpdateNotesDialog version={version} notes={notes} testId="launcher-update" onClose={() => setReading(false)} />}
    </div>
  )
}

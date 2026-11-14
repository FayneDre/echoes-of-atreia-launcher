import { useEffect, useRef, useState } from 'react'
import type { LauncherState, UpdateState } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Markdown } from './Markdown'

interface Props {
  update: UpdateState | null
  state: LauncherState
}

/** The notes of the version offered, over the page: the banner keeps its one line. Closed by its button, Escape or a click beside it. */
function UpdateNotesDialog({ version, notes, onClose }: { version: string; notes: string; onClose: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="dialog news-dialog update-dialog"
      aria-labelledby="update-dialog-title"
      data-testid="launcher-update-dialog"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) {
          dialog.current.close()
        }
      }}
    >
      <h2 id="update-dialog-title">{t('update.notesTitle', { version })}</h2>
      <div className="news-dialog-body">
        <Markdown text={notes} testId="launcher-update-notes" />
      </div>
      <div className="dialog-actions">
        <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
          {t('action.close')}
        </button>
      </div>
    </dialog>
  )
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
      {reading && notes && <UpdateNotesDialog version={version} notes={notes} onClose={() => setReading(false)} />}
    </div>
  )
}

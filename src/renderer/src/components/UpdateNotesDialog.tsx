import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import { Markdown } from './Markdown'

interface Props {
  version: string
  notes: string
  /** `<testId>-dialog` for the dialog, `<testId>-notes` for its text. */
  testId: string
  onClose: () => void
}

/**
 * The notes of a version offered, the launcher's or the server's, over the page: what offers it keeps its size. Closed by its button,
 * Escape or a click beside it.
 */
export function UpdateNotesDialog({ version, notes, testId, onClose }: Props): React.JSX.Element {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="dialog news-dialog update-dialog"
      aria-labelledby={`${testId}-dialog-title`}
      data-testid={`${testId}-dialog`}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialog.current) {
          dialog.current.close()
        }
      }}
    >
      <h2 id={`${testId}-dialog-title`}>{t('update.notesTitle', { version })}</h2>
      <div className="news-dialog-body">
        <Markdown text={notes} testId={`${testId}-notes`} />
      </div>
      <div className="dialog-actions">
        <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
          {t('action.close')}
        </button>
      </div>
    </dialog>
  )
}

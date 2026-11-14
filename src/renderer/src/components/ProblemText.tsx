import { useRef } from 'react'
import type { Problem } from '../../../shared/types'
import { closeOnBackdropClick } from '../dialog'
import { useI18n } from '../i18n'
import { Icon } from './Icon'

interface Props {
  problem: Problem | undefined
  /** A server's problem also offers its log, opened at its tab. */
  onShowLog?: () => void
  /** On a row that keeps one line (a server, MySQL): a "Why?" button alone, the whole problem in the dialog it opens. */
  compact?: boolean
}

/**
 * A problem in one line, with what the system said: shown as is when it is one short line; otherwise (a log excerpt, a script's output) a
 * "Details" button opens it over the page, which never grows with it. Compact, only the button is on the page.
 */
export function ProblemText({ problem, onShowLog, compact = false }: Props): React.JSX.Element | null {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  if (!problem) {
    return null
  }
  const detail = problem.detail?.trim()
  const short = detail && !detail.includes('\n') && detail.length <= 200
  const long = detail && !short
  const open = (): void => dialog.current?.showModal()
  const showLog = onShowLog
    ? (): void => {
        dialog.current?.close()
        onShowLog()
      }
    : undefined

  const inDialog = (
    <dialog ref={dialog} className="dialog problem-dialog" data-testid="problem-dialog" onClick={closeOnBackdropClick}>
      <h2>{t(`problem.${problem.code}`)}</h2>
      {short && compact && <p className="problem-reason">{detail}</p>}
      {long && <pre className="problem-detail">{detail}</pre>}
      <div className="dialog-actions">
        {showLog && compact && (
          <button type="button" className="secondary" onClick={showLog}>
            <Icon name="log" />
            {t('action.showLog')}
          </button>
        )}
        <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
          {t('action.close')}
        </button>
      </div>
    </dialog>
  )

  if (compact) {
    // the alert holds the dialog: what it says is the problem, read out without opening it
    return (
      <span className="problem problem-compact" role="alert">
        <button type="button" className="small problem-why" aria-haspopup="dialog" onClick={open}>
          {t('action.why')}
        </button>
        {inDialog}
      </span>
    )
  }
  return (
    <div className="problem" role="alert">
      <div className="problem-line">
        <p>
          {t(`problem.${problem.code}`)}
          {short && <span className="problem-reason"> {detail}</span>}
        </p>
        {long && (
          <button type="button" className="small" aria-haspopup="dialog" onClick={open}>
            {t('action.details')}
          </button>
        )}
        {onShowLog && (
          <button type="button" className="small" onClick={onShowLog}>
            <Icon name="log" />
            {t('action.showLog')}
          </button>
        )}
      </div>
      {long && inDialog}
    </div>
  )
}

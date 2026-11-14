import { useRef } from 'react'
import type { Problem } from '../../../shared/types'
import { closeOnBackdropClick } from '../dialog'
import { useI18n } from '../i18n'
import { Icon } from './Icon'

/**
 * A problem in one line, with what the system said: shown as is when it is one short line, folded under "Details" otherwise (a log excerpt
 * would push the rest of the page away), or, with `detailsInDialog`, opened over the page so the panel keeps its height. A server's problem
 * also offers its log, opened at its tab.
 */
export function ProblemText({
  problem,
  onShowLog,
  detailsInDialog = false
}: {
  problem: Problem | undefined
  onShowLog?: () => void
  detailsInDialog?: boolean
}): React.JSX.Element | null {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  if (!problem) {
    return null
  }
  const detail = problem.detail?.trim()
  const short = detail && !detail.includes('\n') && detail.length <= 200
  const long = detail && !short
  return (
    <div className="problem" role="alert">
      <div className="problem-line">
        <p>
          {t(`problem.${problem.code}`)}
          {short && <span className="problem-reason"> {detail}</span>}
        </p>
        {long && detailsInDialog && (
          <button type="button" className="small" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
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
      {long && !detailsInDialog && (
        <details className="problem-details">
          <summary>{t('action.details')}</summary>
          <pre className="problem-detail">{detail}</pre>
        </details>
      )}
      {long && detailsInDialog && (
        <dialog ref={dialog} className="dialog" data-testid="problem-dialog" onClick={closeOnBackdropClick}>
          <h2>{t(`problem.${problem.code}`)}</h2>
          <pre className="problem-detail">{detail}</pre>
          <div className="dialog-actions">
            <button type="button" className="button-primary" onClick={() => dialog.current?.close()}>
              {t('action.close')}
            </button>
          </div>
        </dialog>
      )}
    </div>
  )
}

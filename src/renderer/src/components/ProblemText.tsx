import type { Problem } from '../../../shared/types'
import { useI18n } from '../i18n'
import { Icon } from './Icon'

/**
 * A problem in one line, with what the system said: shown as is when it is one short line, folded under "Details" otherwise (a log excerpt
 * would push the rest of the page away). A server's problem also offers its log, opened at its tab.
 */
export function ProblemText({ problem, onShowLog }: { problem: Problem | undefined; onShowLog?: () => void }): React.JSX.Element | null {
  const { t } = useI18n()
  if (!problem) {
    return null
  }
  const detail = problem.detail?.trim()
  const short = detail && !detail.includes('\n') && detail.length <= 200
  return (
    <div className="problem" role="alert">
      <div className="problem-line">
        <p>
          {t(`problem.${problem.code}`)}
          {short && <span className="problem-reason"> {detail}</span>}
        </p>
        {onShowLog && (
          <button type="button" className="small" onClick={onShowLog}>
            <Icon name="log" />
            {t('action.showLog')}
          </button>
        )}
      </div>
      {detail && !short && (
        <details className="problem-details">
          <summary>{t('action.details')}</summary>
          <pre className="problem-detail">{detail}</pre>
        </details>
      )}
    </div>
  )
}

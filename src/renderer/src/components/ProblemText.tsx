import type { Problem } from '../../../shared/types'
import { useI18n } from '../i18n'

export function ProblemText({ problem }: { problem: Problem | undefined }): React.JSX.Element | null {
  const { t } = useI18n()
  if (!problem) {
    return null
  }
  return (
    <div className="problem" role="alert">
      <p>{t(`problem.${problem.code}`)}</p>
      {problem.detail && <pre className="problem-detail">{problem.detail}</pre>}
    </div>
  )
}

import { useRef, useState } from 'react'
import type { ReportResult } from '../../../shared/types'
import { useI18n } from '../i18n'

/**
 * "Report a problem", at the foot of every page: makes a zip of what is needed to understand it (the end of each server's log, the run's bot
 * notes, the versions, the character played) and leaves it on this computer; the person shows the file, or opens an issue that names it.
 */
export function ReportDialog(): React.JSX.Element {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const [creating, setCreating] = useState(false)
  const [report, setReport] = useState<ReportResult | null>(null)
  const [failed, setFailed] = useState(false)

  const open = (): void => {
    setReport(null)
    setFailed(false)
    dialog.current?.showModal()
  }
  const create = async (): Promise<void> => {
    setCreating(true)
    const result = await window.launcher.createReport()
    setCreating(false)
    setReport(result)
    setFailed(result === null)
  }
  const fileName = report ? report.path.split(/[\\/]/).at(-1) : ''

  return (
    <>
      <button type="button" className="link footer-report" data-testid="report-open" onClick={open}>
        {t('report.open')}
      </button>
      <dialog
        ref={dialog}
        className="dialog report-dialog"
        aria-labelledby="report-title"
        data-testid="report-dialog"
        onClick={(event) => {
          if (event.target === dialog.current) {
            dialog.current.close()
          }
        }}
      >
        <h2 id="report-title">{t('report.open')}</h2>
        <p>{t('report.intro')}</p>
        {report && (
          <div className="report-done" role="status" data-testid="report-done">
            <p>{t('report.done', { name: fileName ?? '' })}</p>
            <p className="muted">{t('report.issueHint')}</p>
            <div className="report-actions">
              <button type="button" onClick={() => void window.launcher.showReport()}>
                {t('report.show')}
              </button>
              <button type="button" onClick={() => void window.launcher.openReportIssue()}>
                {t('report.issue')}
              </button>
            </div>
          </div>
        )}
        {failed && (
          <p className="problem" role="alert">
            {t('report.failed')}
          </p>
        )}
        <div className="dialog-actions">
          {!report && (
            <button type="button" className="button-primary" disabled={creating} data-testid="report-create" onClick={() => void create()}>
              {creating ? t('report.creating') : t('report.create')}
            </button>
          )}
          <button type="button" onClick={() => dialog.current?.close()}>
            {t('action.close')}
          </button>
        </div>
      </dialog>
    </>
  )
}

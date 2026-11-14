import { useI18n } from '../i18n'
import { Icon } from './Icon'

interface Props {
  testId: string
  role: 'status' | 'alert'
  onClose: () => void
  children: React.ReactNode
}

/** One line of the notices laid over the top of the page, with its cross to close it. */
export function Notice({ testId, role, onClose, children }: Props): React.JSX.Element {
  const { t } = useI18n()
  return (
    <div className="banner notice" role={role} data-testid={testId}>
      <span className="notice-text">{children}</span>
      <button type="button" className="notice-close" aria-label={t('notice.close')} title={t('notice.close')} onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  )
}

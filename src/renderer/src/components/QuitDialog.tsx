import { useState } from 'react'
import type { QuitAnswer } from '../../../shared/types'
import { useI18n } from '../i18n'

export function QuitDialog(): React.JSX.Element {
  const { t } = useI18n()
  const [stopping, setStopping] = useState(false)

  const answer = (choice: QuitAnswer): void => {
    setStopping(choice === 'stop')
    void window.launcher.answerQuit(choice).finally(() => setStopping(false))
  }

  return (
    <div className="overlay">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="quit-title">
        <h2 id="quit-title">{t('quit.title')}</h2>
        {stopping ? (
          <p>{t('quit.stopping')}</p>
        ) : (
          <>
            <p>{t('quit.body')}</p>
            <p className="muted">{t('quit.backgroundHint')}</p>
            <div className="dialog-actions">
              <button type="button" className="button-primary" onClick={() => answer('stop')}>
                {t('quit.stop')}
              </button>
              <button type="button" data-testid="quit-background" onClick={() => answer('background')}>
                {t('quit.background')}
              </button>
              <button type="button" onClick={() => answer('leave')}>
                {t('quit.leave')}
              </button>
              <button type="button" onClick={() => answer('cancel')}>
                {t('quit.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

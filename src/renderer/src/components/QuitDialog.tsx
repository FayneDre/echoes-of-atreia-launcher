import { useState } from 'react'
import type { QuitAnswer } from '../../../shared/types'
import { useI18n, type MessageKey } from '../i18n'

/** The three ways to leave, each a card with what it does under its name; stopping, the safe one, first and set apart. */
const CHOICES: { answer: Exclude<QuitAnswer, 'cancel'>; label: MessageKey; hint: MessageKey; testId?: string }[] = [
  { answer: 'stop', label: 'quit.stop', hint: 'quit.stopHint' },
  { answer: 'background', label: 'quit.background', hint: 'quit.backgroundHint', testId: 'quit-background' },
  { answer: 'leave', label: 'quit.leave', hint: 'quit.leaveHint' }
]

export function QuitDialog(): React.JSX.Element {
  const { t } = useI18n()
  const [stopping, setStopping] = useState(false)

  const answer = (choice: QuitAnswer): void => {
    setStopping(choice === 'stop')
    void window.launcher.answerQuit(choice).finally(() => setStopping(false))
  }

  return (
    <div className="overlay">
      <div className="dialog quit-dialog" role="dialog" aria-modal="true" aria-labelledby="quit-title">
        <h2 id="quit-title">{t('quit.title')}</h2>
        {stopping ? (
          <p>{t('quit.stopping')}</p>
        ) : (
          <>
            <p>{t('quit.body')}</p>
            <div className="quit-choices">
              {CHOICES.map((choice) => (
                <button
                  key={choice.answer}
                  type="button"
                  className={choice.answer === 'stop' ? 'quit-choice quit-choice-main' : 'quit-choice'}
                  data-testid={choice.testId}
                  onClick={() => answer(choice.answer)}
                >
                  <strong>{t(choice.label)}</strong>
                  <span>{t(choice.hint)}</span>
                </button>
              ))}
            </div>
            <div className="dialog-actions">
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

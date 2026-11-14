import { useEffect, useRef, useState } from 'react'
import { GM_API_LEVEL, GM_MODES, type CharacterSummary, type GmMode, type GmState, type Problem } from '../../../shared/types'
import { closeOnBackdropClick } from '../dialog'
import { useI18n } from '../i18n'
import { ProblemText } from './ProblemText'

/**
 * A staff account's game master modes for the character played, each switched as its command typed in game would, and whether staff names carry
 * their tag. The game server does it, so it must run and the character must be in game; it is read again after each switch.
 */
export function AdminPanel(props: { character: CharacterSummary; gameReady: boolean; apiLevel: number | null }): React.JSX.Element {
  const { t } = useI18n()
  const [state, setState] = useState<GmState | undefined>(undefined)
  const [problem, setProblem] = useState<Problem | undefined>()
  const [busy, setBusy] = useState(false)
  const explanation = useRef<HTMLDialogElement>(null)
  const inGame = props.gameReady && props.character.online
  // learnt just after the game server is ready: nothing is asked before
  const known = props.apiLevel !== null
  const tooOld = known && props.apiLevel! < GM_API_LEVEL

  const read = async (): Promise<void> => {
    const answer = await window.launcher.getGmState()
    if (answer !== null && !('code' in answer)) {
      setState(answer)
      setProblem(undefined)
    } else {
      setState(undefined)
      setProblem(answer ?? undefined)
    }
  }

  useEffect(() => {
    if (!inGame || !known || tooOld) {
      setState(undefined)
      setProblem(undefined)
      return
    }
    void read()
  }, [inGame, known, tooOld, props.character.id])

  // The box shows what was asked at once; the server's answer, read again, then says what it is.
  const run = async (asked: GmState, change: () => Promise<Problem | null>): Promise<void> => {
    setState(asked)
    setBusy(true)
    const result = await change()
    await read()
    if (result) {
      setProblem(result)
    }
    setBusy(false)
  }

  // One line a box, its name only: what each one does is in the dialog, and in the box's tooltip.
  const box = (key: string, name: string, hint: string, checked: boolean, onChange: (on: boolean) => void): React.JSX.Element => (
    <label key={key} className="gm-mode" title={hint}>
      <input type="checkbox" checked={checked} disabled={busy} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="gm-mode-name">{name}</span>
    </label>
  )

  return (
    <div className="admin-panel" data-testid="admin-panel">
      <div className="admin-head">
        <h4>{t('admin.title', { name: props.character.name })}</h4>
        <button type="button" className="link" aria-haspopup="dialog" onClick={() => explanation.current?.showModal()}>
          {t('admin.explain')}
        </button>
      </div>
      {!inGame ? (
        <p className="muted">{t('admin.needsServer')}</p>
      ) : (
        <>
          <p className="muted">{t('admin.lasts')}</p>
          {tooOld && <p className="muted">{t('admin.needsNewerServer')}</p>}
          {state && (
            <div className="gm-modes">
              {GM_MODES.map((mode: GmMode) =>
                box(mode, t(`admin.mode.${mode}` as const), t(`admin.mode.${mode}.hint` as const), state.modes[mode], (on) =>
                  void run({ ...state, modes: { ...state.modes, [mode]: on } }, () => window.launcher.setGmMode(mode, on))
                )
              )}
              {box('tag', t('admin.tag'), t('admin.tag.hint'), state.tag, (shown) =>
                void run({ ...state, tag: shown }, () => window.launcher.setStaffTag(shown))
              )}
            </div>
          )}
          <ProblemText problem={problem} />
        </>
      )}
      <dialog ref={explanation} className="dialog admin-dialog" data-testid="admin-dialog" onClick={closeOnBackdropClick}>
        <h2>{t('admin.explainTitle')}</h2>
        <p className="muted">{t('admin.intro')}</p>
        <dl className="gm-explained">
          {GM_MODES.map((mode) => (
            <div key={mode}>
              <dt>{t(`admin.mode.${mode}` as const)}</dt>
              <dd>{t(`admin.mode.${mode}.hint` as const)}</dd>
            </div>
          ))}
          <div>
            <dt>{t('admin.tag')}</dt>
            <dd>{t('admin.tag.hint')}</dd>
          </div>
        </dl>
        <div className="dialog-actions">
          <button type="button" className="button-primary" onClick={() => explanation.current?.close()}>
            {t('action.close')}
          </button>
        </div>
      </dialog>
    </div>
  )
}

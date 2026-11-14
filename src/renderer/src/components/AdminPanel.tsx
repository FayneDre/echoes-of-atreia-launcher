import { useEffect, useState } from 'react'
import { GM_API_LEVEL, GM_MODES, type CharacterSummary, type GmMode, type GmState, type Problem } from '../../../shared/types'
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

  return (
    <div className="admin-panel" data-testid="admin-panel">
      <h4>{t('admin.title', { name: props.character.name })}</h4>
      {!inGame ? (
        <p className="muted">{t('admin.needsServer')}</p>
      ) : (
        <>
          <p className="muted">{t('admin.intro')}</p>
          {tooOld && <p className="muted">{t('admin.needsNewerServer')}</p>}
          {state && (
            <div className="gm-modes">
              {GM_MODES.map((mode: GmMode) => (
                <label key={mode} className="gm-mode">
                  <input
                    type="checkbox"
                    checked={state.modes[mode]}
                    disabled={busy}
                    onChange={(event) => {
                      const on = event.currentTarget.checked
                      void run({ ...state, modes: { ...state.modes, [mode]: on } }, () => window.launcher.setGmMode(mode, on))
                    }}
                  />
                  <span className="gm-mode-text">
                    <span className="gm-mode-name">{t(`admin.mode.${mode}` as const)}</span>
                    <span className="gm-mode-hint">{t(`admin.mode.${mode}.hint` as const)}</span>
                  </span>
                </label>
              ))}
              <label className="gm-mode">
                <input
                  type="checkbox"
                  checked={state.tag}
                  disabled={busy}
                  onChange={(event) => {
                    const shown = event.currentTarget.checked
                    void run({ ...state, tag: shown }, () => window.launcher.setStaffTag(shown))
                  }}
                />
                <span className="gm-mode-text">
                  <span className="gm-mode-name">{t('admin.tag')}</span>
                  <span className="gm-mode-hint">{t('admin.tag.hint')}</span>
                </span>
              </label>
            </div>
          )}
          <ProblemText problem={problem} />
        </>
      )}
    </div>
  )
}

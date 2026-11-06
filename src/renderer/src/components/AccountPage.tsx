import { useState, type FormEvent } from 'react'
import type { AccountsState, CharacterSummary, Problem } from '../../../shared/types'
import { hasMessage, useI18n } from '../i18n'
import { TeleportPanel } from './TeleportPanel'
import { ProblemText } from './ProblemText'

function SignInForm(props: { name?: string; onDone: () => void; onCancel?: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const [name, setName] = useState(props.name ?? '')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    const result = await window.launcher.signIn(name, password)
    setBusy(false)
    setProblem(result)
    if (!result) {
      setPassword('')
      props.onDone()
    }
  }

  return (
    <form className="sign-in" onSubmit={(event) => void submit(event)}>
      <label>
        <span>{t('account.name')}</span>
        <input
          value={name}
          autoComplete="username"
          maxLength={45}
          readOnly={props.name !== undefined}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>{t('account.password')}</span>
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
      </label>
      <ProblemText problem={problem ?? undefined} />
      <div className="sign-in-actions">
        {props.onCancel && (
          <button type="button" onClick={props.onCancel}>
            {t('account.cancel')}
          </button>
        )}
        <button type="submit" className="button-primary" disabled={busy || !name.trim() || !password}>
          {t('account.signIn')}
        </button>
      </div>
    </form>
  )
}

/** `online` is what the database says, which only a running game server keeps true: a crash or a kill leaves it set. */
function CharacterCard(props: { character: CharacterSummary; selected: boolean; gameReady: boolean; onSelect: () => void }): React.JSX.Element {
  const { t } = useI18n()
  const { character } = props
  const classKey = `class.${character.playerClass}`
  const className = hasMessage(classKey) ? t(classKey) : character.playerClass
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.selected}
      className={`character race-${character.race.toLowerCase()}${props.selected ? ' selected' : ''}`}
      data-testid={`character-${character.name}`}
      onClick={props.onSelect}
    >
      <span className="character-top">
        <span className="character-name">{character.name}</span>
        {props.gameReady && character.online && <span className="tag tag-online">{t('account.online')}</span>}
        {character.deleting && <span className="tag tag-deleting">{t('account.deleting')}</span>}
      </span>
      <span className="character-line">
        {t('account.level', { level: character.level })} · {className} · {t(`race.${character.race}`)}
      </span>
      <span className="character-map">{character.mapName ?? t('account.noMap')}</span>
    </button>
  )
}

export function AccountPage(props: { accounts: AccountsState | null; gameReady: boolean; reload: () => Promise<void> }): React.JSX.Element {
  const { t } = useI18n()
  const [adding, setAdding] = useState(false)
  const { accounts } = props

  if (!accounts) {
    return <section className="panel account-page" aria-busy="true" />
  }

  const active = accounts.active
  const selectedCharacter = accounts.characters.find((character) => character.id === accounts.selectedCharacterId)
  const needsPassword = accounts.problem?.code === 'password-needed'
  const showSignIn = adding || accounts.accounts.length === 0

  const act = async (work: Promise<unknown>): Promise<void> => {
    await work
    await props.reload()
  }

  return (
    <section className="panel account-page" aria-labelledby="account-title">
      <header className="settings-header">
        <h2 id="account-title">{t('nav.account')}</h2>
        <p className="muted">{t('account.intro')}</p>
      </header>

      <div className="settings-layout">
        <div className="group-list" role="tablist" aria-orientation="vertical" aria-label={t('account.accounts')}>
          {accounts.accounts.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={!adding && name === active}
              onClick={() => {
                setAdding(false)
                void act(window.launcher.switchAccount(name))
              }}
            >
              <span>{name}</span>
            </button>
          ))}
          <button type="button" className="add-account" aria-selected={adding} onClick={() => setAdding(true)}>
            + {t('account.add')}
          </button>
        </div>

        <div className="group-panel">
          {showSignIn ? (
            <>
              <h3>{t('account.add')}</h3>
              <SignInForm
                onDone={() => {
                  setAdding(false)
                  void props.reload()
                }}
                onCancel={accounts.accounts.length > 0 ? () => setAdding(false) : undefined}
              />
            </>
          ) : (
            <>
              <div className="group-panel-header">
                <h3>{active}</h3>
                <span className="header-actions">
                  <button type="button" className="small" onClick={() => void props.reload()}>
                    {t('account.refresh')}
                  </button>
                  <button
                    type="button"
                    className="small button-danger"
                    onClick={() => {
                      if (active && window.confirm(t('account.forgetConfirm', { name: active }))) {
                        void act(window.launcher.forgetAccount(active))
                      }
                    }}
                  >
                    {t('account.forget')}
                  </button>
                </span>
              </div>

              {needsPassword && active ? (
                <>
                  <ProblemText problem={accounts.problem} />
                  <h4>{t('account.signInAgain', { name: active })}</h4>
                  <SignInForm key={active} name={active} onDone={() => void props.reload()} />
                </>
              ) : accounts.problem ? (
                <ProblemText problem={accounts.problem} />
              ) : accounts.characters.length === 0 ? (
                <p className="muted">{t('account.noCharacters')}</p>
              ) : (
                <>
                  <p className="muted">{t('account.choose')}</p>
                  <div className="characters" role="radiogroup" aria-label={t('account.characters')}>
                    {accounts.characters.map((character) => (
                      <CharacterCard
                        key={character.id}
                        character={character}
                        selected={character.id === accounts.selectedCharacterId}
                        gameReady={props.gameReady}
                        onSelect={() => void act(window.launcher.selectCharacter(character.id))}
                      />
                    ))}
                  </div>
                  {selectedCharacter && <TeleportPanel character={selectedCharacter} gameReady={props.gameReady} />}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

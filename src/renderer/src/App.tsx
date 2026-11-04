import { useState } from 'react'
import { AccountPage } from './components/AccountPage'
import { BackupsPage } from './components/BackupsPage'
import { BotsPage } from './components/BotsPage'
import { InstallPanel } from './components/InstallPanel'
import { QuitDialog } from './components/QuitDialog'
import { ServersPanel } from './components/ServersPanel'
import { SettingsPage } from './components/SettingsPage'
import { TerminalPanel } from './components/TerminalPanel'
import { LANGUAGES, useI18n, type MessageKey } from './i18n'
import { useAccounts, useLauncherState } from './useLauncher'

type Page = 'home' | 'account' | 'bots' | 'settings' | 'backups'

const PAGES: { id: Page; label: MessageKey }[] = [
  { id: 'home', label: 'nav.home' },
  { id: 'account', label: 'nav.account' },
  { id: 'settings', label: 'nav.settings' },
  { id: 'bots', label: 'nav.bots' },
  { id: 'backups', label: 'nav.backups' }
]

export function App(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const state = useLauncherState()
  const { accounts, reload } = useAccounts(state)
  const [page, setPage] = useState<Page>('home')
  const playing = accounts?.characters.find((character) => character.id === accounts.selectedCharacterId)

  return (
    <div className="app">
      <header className="header">
        <div className="brand-block">
          <h1 className="title">Echoes of Atreia</h1>
          <p className="tagline">{t('home.tagline')}</p>
        </div>
        {playing && (
          <button type="button" className="playing" data-testid="playing" onClick={() => setPage('account')}>
            {t('account.playing', { name: playing.name })}
          </button>
        )}
        <nav className="nav" aria-label={t('nav.label')}>
          {PAGES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={page === entry.id ? 'page' : undefined}
              onClick={() => {
                setPage(entry.id)
                // What is in game changes while one plays: the list is read again on arrival.
                if (entry.id === 'account') {
                  void reload()
                }
              }}
            >
              {t(entry.label)}
            </button>
          ))}
        </nav>
        <div className="language-switch" role="group" aria-label={t('language.label')}>
          {LANGUAGES.map((code) => (
            <button key={code} type="button" aria-pressed={language === code} onClick={() => setLanguage(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {state?.restartNeeded && (
        <p className="banner" role="status" data-testid="restart-needed">
          {t('settings.restartNeeded')}
        </p>
      )}

      {/* Every page stays mounted and the others are hidden: what was typed on one survives a look at another. */}
      {state && (
        <main className="content" hidden={page !== 'home'}>
          <div className="column">
            <ServersPanel state={state} />
            <InstallPanel state={state} />
          </div>
          <TerminalPanel />
        </main>
      )}
      {state && (
        <main className="content content-single" hidden={page !== 'account'}>
          <AccountPage accounts={accounts} gameReady={state?.servers.game.status === 'ready'} reload={reload} />
        </main>
      )}
      {state && (
        <main className="content content-single" hidden={page !== 'bots'}>
          <BotsPage state={state} visible={page === 'bots'} />
        </main>
      )}
      {state && (
        <main className="content content-single" hidden={page !== 'settings'}>
          <SettingsPage state={state} />
        </main>
      )}
      {state && (
        <main className="content content-single" hidden={page !== 'backups'}>
          <BackupsPage state={state} visible={page === 'backups'} />
        </main>
      )}

      <footer className="footer">{t('footer.disclaimer')}</footer>
      {state?.quitRequested && <QuitDialog />}
    </div>
  )
}

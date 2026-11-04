import { useState } from 'react'
import { InstallPanel } from './components/InstallPanel'
import { QuitDialog } from './components/QuitDialog'
import { ServersPanel } from './components/ServersPanel'
import { SettingsPage } from './components/SettingsPage'
import { TerminalPanel } from './components/TerminalPanel'
import { LANGUAGES, useI18n } from './i18n'
import { useLauncherState } from './useLauncher'

type Page = 'home' | 'settings'

export function App(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const state = useLauncherState()
  const [page, setPage] = useState<Page>('home')

  return (
    <div className="app">
      <header className="header">
        <div className="brand-block">
          <h1 className="title">Echoes of Atreia</h1>
          <p className="tagline">{t('home.tagline')}</p>
        </div>
        <nav className="nav" aria-label={t('nav.label')}>
          <button type="button" aria-current={page === 'home' ? 'page' : undefined} onClick={() => setPage('home')}>
            {t('nav.home')}
          </button>
          <button type="button" aria-current={page === 'settings' ? 'page' : undefined} onClick={() => setPage('settings')}>
            {t('nav.settings')}
          </button>
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

      {/* Both pages stay mounted and the other is hidden: settings changed but not saved survive a look at the servers. */}
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
        <main className="content content-single" hidden={page !== 'settings'}>
          <SettingsPage state={state} />
        </main>
      )}

      <footer className="footer">{t('footer.disclaimer')}</footer>
      {state?.quitRequested && <QuitDialog />}
    </div>
  )
}

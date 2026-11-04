import { InstallPanel } from './components/InstallPanel'
import { QuitDialog } from './components/QuitDialog'
import { ServersPanel } from './components/ServersPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { LANGUAGES, useI18n } from './i18n'
import { useLauncherState } from './useLauncher'

export function App(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const state = useLauncherState()

  return (
    <div className="app">
      <header className="header">
        <div className="brand-block">
          <h1 className="title">Echoes of Atreia</h1>
          <p className="tagline">{t('home.tagline')}</p>
        </div>
        <div className="language-switch" role="group" aria-label={t('language.label')}>
          {LANGUAGES.map((code) => (
            <button key={code} type="button" aria-pressed={language === code} onClick={() => setLanguage(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {state && (
        <main className="content">
          <div className="column">
            <ServersPanel state={state} />
            <InstallPanel state={state} />
          </div>
          <TerminalPanel />
        </main>
      )}

      <footer className="footer">{t('footer.disclaimer')}</footer>
      {state?.quitRequested && <QuitDialog />}
    </div>
  )
}

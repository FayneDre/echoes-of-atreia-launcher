import { LANGUAGES, useI18n } from './i18n'

export function App(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()

  return (
    <div className="app">
      <header className="header">
        <span className="brand">Echoes of Atreia</span>
        <div className="language-switch" role="group" aria-label={t('language.label')}>
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="home">
        <h1 className="title">Echoes of Atreia</h1>
        <p className="tagline">{t('home.tagline')}</p>
      </main>

      <footer className="footer">{t('footer.disclaimer')}</footer>
    </div>
  )
}

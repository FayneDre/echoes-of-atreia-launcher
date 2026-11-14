import { useEffect, useState } from 'react'
import { AccountPage } from './components/AccountPage'
import { BackupsPage } from './components/BackupsPage'
import { BotsPage } from './components/BotsPage'
import { InstallPanel } from './components/InstallPanel'
import { QuitDialog } from './components/QuitDialog'
import { ReportDialog } from './components/ReportDialog'
import { ServerSetupPanel } from './components/ServerSetupPanel'
import { ServerUpdatePanel } from './components/ServerUpdatePanel'
import { ServersPanel } from './components/ServersPanel'
import { SettingsPage } from './components/SettingsPage'
import { TerminalPanel } from './components/TerminalPanel'
import { UpdateBanner } from './components/UpdateBanner'
import { LANGUAGES, useI18n, type MessageKey } from './i18n'
import { MIN_SERVER_API_LEVEL, MIN_SERVER_VERSION, SERVER_IDS, isServerTooOld, type ServerId, type ServerVersion } from '../../shared/types'
import { useAccounts, useFullScreen, useHomeInfo, useLauncherState, useNews, useServerSetup, useServerUpdate, useUpdate } from './useLauncher'
import { HomeHero } from './components/HomeHero'
import { NewsPanel } from './components/NewsPanel'
import emblem from './assets/emblem.png'

type Page = 'home' | 'account' | 'bots' | 'settings' | 'backups'

/** The pages that ask the game server for something its admin channel or its settings must have. */
const NEEDS_SERVER_API: Page[] = ['account', 'bots', 'settings']

const PAGES: { id: Page; label: MessageKey }[] = [
  { id: 'home', label: 'nav.home' },
  { id: 'account', label: 'nav.account' },
  { id: 'settings', label: 'nav.settings' },
  { id: 'bots', label: 'nav.bots' },
  { id: 'backups', label: 'nav.backups' }
]

/** The server's version for the footer: a release's tag, or `dev` with its revision. */
function serverLabel(version: ServerVersion | null): string {
  if (!version) {
    return '—'
  }
  if (version.version === 'dev' || version.version === null) {
    return version.revision ? `dev ${version.revision}` : 'dev'
  }
  return version.version
}

const TERMINALS_OPEN_KEY = 'terminals-open'

/** Whether the person left the terminals open; closed when nothing was kept (a first start, storage refused). */
function readTerminalsOpen(): boolean {
  try {
    return localStorage.getItem(TERMINALS_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

export function App(): React.JSX.Element {
  const { language, setLanguage, t } = useI18n()
  const state = useLauncherState()
  const update = useUpdate()
  const serverUpdate = useServerUpdate()
  const serverSetup = useServerSetup()
  const { accounts, reload } = useAccounts(state)
  const [page, setPage] = useState<Page>('home')
  const playing = accounts?.characters.find((character) => character.id === accounts.selectedCharacterId)
  const [terminalsOpen, setTerminalsOpenState] = useState(readTerminalsOpen)
  const [terminal, setTerminal] = useState<ServerId>('game')
  const news = useNews()
  const fullScreen = useFullScreen()
  // a new value reads the home information again at once (after a backup made from the hero)
  const [infoTick, setInfoTick] = useState(0)
  const homeInfo = useHomeInfo(state, page === 'home', infoTick)
  const setTerminalsOpen = (open: boolean): void => {
    setTerminalsOpenState(open)
    try {
      localStorage.setItem(TERMINALS_OPEN_KEY, open ? '1' : '0')
    } catch {
      // a convenience only: the drawer starts closed next time
    }
  }
  const showLog = (id: ServerId): void => {
    setTerminal(id)
    setTerminalsOpen(true)
  }

  // A server that fails opens its log, once per failure.
  const failed = SERVER_IDS.find((id) => state?.servers[id].status === 'failed') ?? null
  useEffect(() => {
    if (failed) {
      showLog(failed)
    }
  }, [failed]) // only a new failure opens the drawer

  return (
    <div className="app">
      {/* the window's bar, holding the title: dragged to move the window; Windows draws its three buttons over its right end */}
      <div className={fullScreen ? 'titlebar titlebar-full-screen' : 'titlebar'}>
        <img className="titlebar-emblem" src={emblem} alt="" aria-hidden="true" />
        <div className="titlebar-text">
          <h1 className="title">Echoes of Atreia</h1>
          <p className="tagline">{t('home.tagline')}</p>
        </div>
        {/* in full screen Windows draws no buttons: the way out is the page's own */}
        {fullScreen && (
          <button
            type="button"
            className="leave-full-screen"
            data-testid="leave-full-screen"
            title={t('window.leaveFullScreenHint')}
            onClick={() => void window.launcher.setFullScreen(false)}
          >
            {t('window.leaveFullScreen')}
          </button>
        )}
      </div>
      {/* one row, one height: the character played, the pages, the languages */}
      <header className="header">
        {playing ? (
          <button type="button" className="playing" data-testid="playing" onClick={() => setPage('account')}>
            <span className="playing-label">{t('account.playingLabel')}</span>
            <span className="playing-name">{playing.name}</span>
          </button>
        ) : (
          <span />
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

      {state && <UpdateBanner update={update} state={state} />}

      {state && isServerTooOld(state.serverVersion) && NEEDS_SERVER_API.includes(page) && (
        <p className="banner" role="alert" data-testid="server-too-old">
          {t('server.tooOld', { level: state.serverVersion!.apiLevel, needed: MIN_SERVER_API_LEVEL, version: MIN_SERVER_VERSION })}
        </p>
      )}

      {state?.restartNeeded && (
        <p className="banner" role="status" data-testid="restart-needed">
          {t('settings.restartNeeded')}
        </p>
      )}

      {/* Every page stays mounted and the others are hidden: what was typed on one survives a look at another. */}
      {state && (
        <main className="content content-home" hidden={page !== 'home'}>
          <div className="page-scroll">
            <div className="home-grid">
              <div className="home-wide">
                <HomeHero state={state} accounts={accounts} info={homeInfo} onReloadInfo={() => setInfoTick(infoTick + 1)} />
              </div>
              <div className="home-column">
                <ServersPanel state={state} onShowLog={showLog} />
                <InstallPanel state={state} info={homeInfo} onOpenBackups={() => setPage('backups')} />
              </div>
              <div className="home-column">
                <ServerSetupPanel setup={serverSetup} state={state} />
                <ServerUpdatePanel update={serverUpdate} state={state} />
                <NewsPanel news={news} />
              </div>
            </div>
          </div>
          <TerminalPanel
            open={terminalsOpen}
            serverFound={state.install.serverFound}
            server={terminal}
            onToggle={() => setTerminalsOpen(!terminalsOpen)}
            onSelect={setTerminal}
          />
        </main>
      )}
      {state && (
        <main className="content content-single" hidden={page !== 'account'}>
          <AccountPage accounts={accounts} gameReady={state?.servers.game.status === 'ready'} reload={reload} />
        </main>
      )}
      {state && (
        <main className="content content-single" hidden={page !== 'bots'}>
          <SettingsPage state={state} page="bots" />
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

      <footer className="footer">
        <span>{t('footer.disclaimer')}</span>
        <ReportDialog />
        <span className="footer-versions" data-testid="footer-versions">
          {t('footer.versions', {
            launcher: window.launcher.version ?? '…',
            server: serverLabel(state?.serverVersion ?? null)
          })}
        </span>
      </footer>
      {state?.quitRequested && <QuitDialog />}
    </div>
  )
}

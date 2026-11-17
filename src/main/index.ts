import { rm, statfs } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron'
import {
  GM_MODES,
  LAUNCHER_VERSION_ARG,
  SERVER_IDS,
  isBetaVersion,
  type FolderKind,
  type GmMode,
  type HomeInfo,
  type Problem,
  type QuitAnswer,
  type ReportResult,
  type ServerId
} from '../shared/types'
import appIcon from '../../build/icon.ico?asset'
import { AccountService } from './accounts/accountService'
import { accountStoreFor } from './accounts/accountStore'
import { BackupService } from './backup/backupService'
import { listBots } from './bots/botList'
import { setGithubCacheDir } from './github/cachedJson'
import { Launcher } from './launcher'
import { NewsFeed } from './news'
import { processMemoryMb } from './system/memory'
import { validValues } from './server/serverSettings'
import { SETUP_LOG, ServerSetup, fakeSetupChecks } from './serverUpdate/serverSetup'
import { ServerUpdater } from './serverUpdate/serverUpdater'
import { isAutoCleanup, isDeveloperMode, SettingsStore } from './settings'
import { createReport, issueUrl } from './report'
import { cleanUp } from './system/cleanup'
import { readSystemOptions, setSystemOption } from './system/systemOptions'
import { TaskbarPresence, type TrayLanguage } from './taskbar'
import { LauncherUpdater } from './update/updater'
import { followFullScreen } from './fullScreen'
import { DESIGN_HEIGHT, DESIGN_WIDTH, followWindowSize, TITLE_BAR_HEIGHT } from './windowScale'

// Lets the end-to-end tests run against a throwaway profile instead of the player's own.
const userDataDir = process.env['ECHOES_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}
// Drawn without the graphics card: a page of text and a small chart gains nothing from it, and its process held 110 to 190 MB more,
// measured on the real install (private memory 250-350 MB against 157-171 MB, idle CPU 0.5 % against 0.3 % of a core). The game
// shares that card and that memory.
app.disableHardwareAcceleration()
// GitHub's answers kept between runs: asked again at each start with their ETag, given back when GitHub refuses
setGithubCacheDir(join(app.getPath('userData'), 'github-cache'))

const settings = new SettingsStore()
const launcher = new Launcher(settings)
const accounts = new AccountService(settings, () => launcher.currentLayout)
const backups = new BackupService(() => launcher.currentLayout)
/** The automatic backups kept, the newest: each holds both databases, so a few are enough to go back past a bad evening. */
const AUTO_BACKUPS_KEPT = 5
// after each clean stop, MySQL still running: what the game server saved on its way out is in it
launcher.setAfterCleanStop(async () => {
  const result = await backups.create('auto')
  if ('code' in result) {
    return result
  }
  await backups.prune('auto', AUTO_BACKUPS_KEPT)
  return null
})
const updater = new LauncherUpdater()
// A beta launcher installs the server's pre-releases too, a stable one its releases only: decided by its own version, with no setting.
const serverUpdater = new ServerUpdater(launcher, isBetaVersion(app.getVersion()), () => isDeveloperMode(settings.current))
// An install from nothing takes the newest release the same launcher would update to.
const serverSetup = new ServerSetup(launcher, isBetaVersion(app.getVersion()), undefined, fakeSetupChecks(process.env['ECHOES_FAKE_SETUP_CHECKS']))
/**
 * The two repositories on this computer whose notes stand in for GitHub in the developer mode: beside the server's folder (the launcher's
 * `echoes-of-atreia-launcher`, the server's `source/aion-server-4.8`), the launcher's own when it runs from its sources, or as
 * `ECHOES_LAUNCHER_REPO` and `ECHOES_SERVER_REPO` say. Null outside the developer mode.
 */
function localRepositories(): Record<'launcher' | 'server', string | null> | null {
  if (!isDeveloperMode(settings.current)) {
    return null
  }
  const root = launcher.currentLayout?.root
  const parent = root ? dirname(root) : null
  return {
    launcher: process.env['ECHOES_LAUNCHER_REPO'] ?? (app.isPackaged ? (parent ? join(parent, 'echoes-of-atreia-launcher') : null) : app.getAppPath()),
    server: process.env['ECHOES_SERVER_REPO'] ?? (parent ? join(parent, 'source', 'aion-server-4.8') : null)
  }
}

const news = new NewsFeed(isBetaVersion(app.getVersion()), localRepositories)

/** The bots in the world by faction while the game server is ready, else null: what the home shows and the last hour's curve counts. */
async function botsInWorld(): Promise<HomeInfo['botsInWorld']> {
  if (launcher.getState().servers.game.status !== 'ready') {
    return null
  }
  const bots = await listBots(launcher.currentLayout)
  if (!Array.isArray(bots)) {
    return null
  }
  const present = bots.filter((bot) => bot.inWorld)
  return {
    elyos: present.filter((bot) => bot.race === 'ELYOS').length,
    asmodians: present.filter((bot) => bot.race === 'ASMODIANS').length
  }
}

// a point a minute; the end-to-end tests ask for one every few hundred milliseconds

/** The interface's language, which the tray's menu and a report's issue text follow. */
let language: TrayLanguage = 'fr'
/** The last report made: the only file the page may ask to show, and the issue page made for it. */
let lastReport: ReportResult | null = null

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength
// Set once the person has said what to do with running servers, so the window may close.
let quitAllowed = false
/** The window, while there is one: put in the background, it is closed, not hidden, and the icon in the notification area opens another. */
let mainWindow: BrowserWindow | null = null
/**
 * Set while the launcher runs without a window: its page and its drawing held 40 to 60 MB nothing reads there. The servers, the icon in the
 * notification area and the bots' curve go on in this process; a new window reads them all back.
 */
let inBackground = false
let presence: TaskbarPresence | null = null

/** What the launcher publishes, to the window when there is one: a window opened later asks for the current state itself. */
function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

/** The window, brought to the front, or opened again after the background. */
function openWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }
  inBackground = false
  const window = createWindow()
  mainWindow = window
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })
  presence?.attach(window)
  return window
}

/** A file dialog over the window that asked for it. */
function openDialog(event: IpcMainInvokeEvent, options: OpenDialogOptions): ReturnType<typeof dialog.showOpenDialog> {
  const owner = BrowserWindow.fromWebContents(event.sender)
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)
}

function isServerId(value: unknown): value is ServerId {
  return typeof value === 'string' && (SERVER_IDS as readonly string[]).includes(value)
}

function registerIpc(presence: TaskbarPresence): void {
  ipcMain.handle('launcher:get-state', () => launcher.getState())
  ipcMain.handle('launcher:get-logs', (_event, id: unknown) => (isServerId(id) ? launcher.getLogs(id) : []))
  ipcMain.handle('launcher:open-log-folder', async (_event, id: unknown) => {
    const folder = isServerId(id) ? launcher.logFolder(id) : null
    if (folder) {
      await shell.openPath(folder)
    }
  })
  ipcMain.handle('launcher:set-language', (_event, value: unknown) => {
    if (value === 'fr' || value === 'en') {
      language = value
      presence.setLanguage(value)
      launcher.setInterfaceLanguage(value)
    }
  })
  ipcMain.handle('launcher:start', () => launcher.startAll())
  ipcMain.handle('launcher:stop', () => launcher.stopAll())
  ipcMain.handle('launcher:force-stop', (_event, id: unknown) => (isServerId(id) ? launcher.forceStop(id) : false))
  ipcMain.handle('launcher:restart-server', (_event, id: unknown) => (isServerId(id) ? launcher.restartServer(id) : false))
  ipcMain.handle('launcher:mysql-start', () => launcher.startMysql())
  ipcMain.handle('launcher:mysql-stop', () => launcher.stopMysql())
  ipcMain.handle('launcher:play', () => launcher.play())
  ipcMain.handle('accounts:get-state', () => accounts.getState())
  // Account names are 45 characters at most in the login database; a password is checked, never stored in clear.
  ipcMain.handle('accounts:sign-in', (_event, name: unknown, password: unknown) =>
    isText(name, 45) && isText(password, 256) ? accounts.signIn(name.trim(), password) : { code: 'account-unknown' }
  )
  ipcMain.handle('accounts:switch', (_event, name: unknown) => (isText(name, 45) ? accounts.switchTo(name) : undefined))
  ipcMain.handle('accounts:forget', (_event, name: unknown) => (isText(name, 45) ? accounts.forget(name) : undefined))
  ipcMain.handle('accounts:select-character', (_event, id: unknown) =>
    Number.isInteger(id) ? accounts.selectCharacter(id as number) : undefined
  )
  ipcMain.handle('bots:list', () => listBots(launcher.currentLayout))
  ipcMain.handle('bots:population', () => launcher.getPopulation())
  ipcMain.handle('report:create', async (): Promise<ReportResult | null> => {
    const layout = launcher.currentLayout
    let character = null
    try {
      const accountState = await accounts.getState()
      character = accountState.characters.find((candidate) => candidate.id === accountState.selectedCharacterId) ?? null
    } catch {
      // no database to read the character from: the report says none
    }
    const context = {
      launcherVersion: app.getVersion(),
      state: launcher.getState(),
      serverUpdate: serverUpdater.current,
      serverSetup: serverSetup.current,
      character,
      botsInWorld: await botsInWorld().catch(() => null),
      language
    }
    try {
      const path = await createReport(layout, join(layout?.root ?? app.getPath('userData'), 'reports'), context)
      lastReport = { path, issueUrl: issueUrl(context, parse(path).base) }
      return lastReport
    } catch {
      return null
    }
  })
  ipcMain.handle('window:get-full-screen', (event) => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false)
  ipcMain.handle('window:set-full-screen', (event, on: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(on === true)
  })
  ipcMain.handle('report:show', () => {
    if (lastReport) {
      shell.showItemInFolder(lastReport.path)
    }
  })
  ipcMain.handle('report:open-issue', async () => {
    if (lastReport) {
      await shell.openExternal(lastReport.issueUrl)
    }
  })
  ipcMain.handle('game:destinations', () => launcher.listDestinations())
  ipcMain.handle('game:teleport', async (_event, destinationId: unknown) => {
    // Through the account's state, so the stored password is checked again as for everything else the page shows.
    const character = (await accounts.getState()).selectedCharacterId
    if (!character) {
      return { code: 'no-character' }
    }
    return Number.isInteger(destinationId) ? launcher.teleport(character, destinationId as number) : { code: 'admin-failed' }
  })
  // The game master modes, for the character played on a staff account only, checked against the database as the teleport is.
  const staffCharacter = async (): Promise<number | Problem> => {
    const state = await accounts.getState()
    if (!state.staff) {
      return { code: 'admin-failed', detail: 'not a staff account' }
    }
    return state.selectedCharacterId ?? { code: 'no-character' }
  }
  ipcMain.handle('admin:gm-state', async () => {
    const character = await staffCharacter()
    return typeof character === 'number' ? launcher.getGmState(character) : character
  })
  ipcMain.handle('admin:gm-set', async (_event, mode: unknown, on: unknown) => {
    const character = await staffCharacter()
    if (typeof character !== 'number') {
      return character
    }
    return GM_MODES.includes(mode as GmMode) && typeof on === 'boolean' ? launcher.setGmMode(character, mode as GmMode, on) : { code: 'admin-failed' }
  })
  ipcMain.handle('admin:staff-tag', async (_event, shown: unknown) => {
    const character = await staffCharacter()
    if (typeof character !== 'number') {
      return character
    }
    return typeof shown === 'boolean' ? launcher.setStaffTag(shown) : { code: 'admin-failed' }
  })
  ipcMain.handle('backups:list', () => backups.list())
  ipcMain.handle('backups:create', () =>
    launcher.withActivity('backup', async () => {
      const result = await backups.create()
      return 'code' in result ? result : null
    })
  )
  ipcMain.handle('backups:restore', (_event, id: unknown) =>
    typeof id === 'string' ? launcher.withActivity('restore', () => backups.restore(id)) : { code: 'restore-failed' }
  )
  // Not while a backup or a restore is under way: it may be the very one being read.
  ipcMain.handle('backups:remove', (_event, id: unknown) =>
    typeof id === 'string' && launcher.getState().activity === 'idle' ? backups.remove(id) : undefined
  )
  ipcMain.handle('backups:open-folder', async () => {
    const folder = await backups.folderPath()
    if (folder) {
      await shell.openPath(folder)
    }
  })
  ipcMain.handle('launcher:get-server-settings', () => launcher.getServerSettings())
  ipcMain.handle('launcher:save-server-settings', (_event, value: unknown) => {
    const values = validValues(value)
    return values ? launcher.saveServerSettings(values) : false
  })
  ipcMain.handle('launcher:choose-folder', async (event, kind: unknown) => {
    if (kind !== 'server' && kind !== 'client') {
      return
    }
    const result = await openDialog(event, { properties: ['openDirectory'] })
    const folder = result.filePaths[0]
    if (!result.canceled && folder) {
      await launcher.chooseFolder(kind as FolderKind, folder)
    }
  })
  ipcMain.handle('launcher:choose-mysql-options', async (event) => {
    const result = await openDialog(event, {
      properties: ['openFile'],
      filters: [{ name: 'MySQL (my.ini, my.cnf)', extensions: ['ini', 'cnf'] }]
    })
    const file = result.filePaths[0]
    if (!result.canceled && file) {
      await launcher.chooseMysqlOptions(file)
    }
  })
  ipcMain.handle('launcher:use-mysql-service', () => launcher.chooseMysqlOptions(null))
  ipcMain.handle('news:get-state', () => news.current)
  ipcMain.handle('news:refresh', () => news.refresh())
  ipcMain.handle('settings:set-start-servers', async (_event, on: unknown) => {
    if (typeof on === 'boolean') {
      await launcher.setStartServersOnLaunch(on)
    }
  })
  ipcMain.handle('settings:set-auto-cleanup', async (_event, on: unknown) => {
    if (typeof on === 'boolean') {
      await launcher.setAutoCleanup(on)
    }
  })
  ipcMain.handle('settings:set-auto-backup', async (_event, on: unknown) => {
    if (typeof on === 'boolean') {
      await launcher.setAutoBackup(on)
    }
  })
  ipcMain.handle('client:check', () => launcher.checkClient())
  ipcMain.handle('client:set-language', (_event, code: unknown) => (typeof code === 'string' ? launcher.setClientLanguage(code) : undefined))
  ipcMain.handle('system:get-options', () => readSystemOptions())
  ipcMain.handle('system:set-option', async (_event, option: unknown, on: unknown) => {
    if ((option === 'startWithWindows' || option === 'desktopShortcut') && typeof on === 'boolean') {
      await setSystemOption(option, on)
    }
    return readSystemOptions()
  })
  ipcMain.handle('settings:set-developer-mode', async (_event, on: unknown) => {
    if (typeof on !== 'boolean') {
      return
    }
    await launcher.setDeveloperMode(on)
    // what the mode changes, read again at once
    void news.refresh()
    void serverUpdater.check()
    updater.start(on)
  })
  ipcMain.handle('home:get-info', async (): Promise<HomeInfo> => {
    const backupList = await backups.list()
    const lastBackup = backupList.map((backup) => backup.createdAt).sort().at(-1) ?? null
    const backupBytes = backupList.reduce((sum, backup) => sum + backup.databases.reduce((total, database) => total + database.bytes, 0), 0)
    const state = launcher.getState()
    const layout = launcher.currentLayout
    let disk: HomeInfo['disk'] = null
    if (layout) {
      try {
        const stats = await statfs(layout.root)
        disk = { drive: parse(layout.root).root.replace(/[\\/]+$/, ''), freeBytes: stats.bavail * stats.bsize }
      } catch {
        // a drive that cannot be asked: nothing said
      }
    }
    // only while MySQL answers: a connection to a stopped one would hold the page for its timeout
    let database: HomeInfo['database'] = null
    if (layout && state.mysql.status === 'ready') {
      try {
        database = await accountStoreFor(layout).databaseInfo()
      } catch {
        // the game server's database not created yet, or the account refused
      }
    }
    const pid = launcher.gameProcessId
    const gameMemoryMb = pid !== null && state.servers.game.status !== 'stopped' ? await processMemoryMb(pid) : null
    return { lastBackup, botsInWorld: await botsInWorld(), gameMemoryMb, disk, backups: { count: backupList.length, bytes: backupBytes }, database }
  })
  ipcMain.handle('server-update:get-state', () => serverUpdater.current)
  ipcMain.handle('server-update:prepare', () => serverUpdater.prepare())
  ipcMain.handle('server-update:install', () => serverUpdater.install())
  ipcMain.handle('server-update:cancel', () => serverUpdater.cancel())
  ipcMain.handle('server-update:undo', () => serverUpdater.undo())
  ipcMain.handle('server-setup:get-state', () => serverSetup.current)
  // A try again goes back to the folder of the try that failed; otherwise the person picks one (an empty one, or one a folder is made in).
  ipcMain.handle('server-setup:install', async (event, retry: unknown) => {
    const failed = serverSetup.current
    if (retry === true && failed.status === 'failed' && failed.folder) {
      return serverSetup.install(failed.folder)
    }
    const result = await openDialog(event, { properties: ['openDirectory', 'createDirectory', 'promptToCreate'] })
    const folder = result.filePaths[0]
    return !result.canceled && folder ? serverSetup.install(folder) : null
  })
  // what the database's script said, in the folder of the try: the path is the launcher's own, never one the window gives
  ipcMain.handle('server-setup:open-log', async () => {
    const folder = serverSetup.current.folder
    if (folder) {
      await shell.openPath(join(folder, SETUP_LOG))
    }
  })
  ipcMain.handle('server:uninstall', () => launcher.uninstallServer(backups, keptBackupsFolder()))
  ipcMain.handle('update:get-state', () => updater.current)
  ipcMain.handle('update:download', () => updater.download())
  // Not while servers start or stop, or the server's files change; closing then asks what to do with the running ones, as any close does.
  ipcMain.handle('update:install', () => {
    const { activity } = launcher.getState()
    if (activity === 'starting' || activity === 'stopping' || activity === 'server-update' || activity === 'uninstall' || !updater.askInstall()) {
      return false
    }
    mainWindow?.close()
    return true
  })
  ipcMain.handle('launcher:quit-answer', async (_event, answer: QuitAnswer) => {
    if (answer === 'background') {
      // the servers keep running under the launcher, which stays in the notification area: its icon opens a window again
      launcher.setQuitRequested(false)
      updater.cancelInstall()
      inBackground = true
      // destroyed, not closed: closing asks again what to do with the running servers
      mainWindow?.destroy()
      return
    }
    if (answer === 'stop' && !(await launcher.stopAll())) {
      // A server would not stop: the window stays, and its status says why.
      launcher.setQuitRequested(false)
      updater.cancelInstall()
      return
    }
    if (answer === 'stop' || answer === 'leave') {
      quitAllowed = true
      mainWindow?.close()
      return
    }
    launcher.setQuitRequested(false)
    updater.cancelInstall()
  })

  launcher.on('state', (state) => send('launcher:state', state))
  launcher.on('state', (state) => presence.setState(state))
  serverUpdater.on('state', (state) => presence.setServerUpdate(state))
  launcher.on('lines', (batch) => send('launcher:lines', batch))
  updater.on('state', (state) => send('update:state', state))
  serverUpdater.on('state', (state) => send('server-update:state', state))
  serverSetup.on('state', (state) => send('server-setup:state', state))
  news.on('state', (state) => send('news:state', state))
  // The server folder found at start, or chosen later: its releases are looked at again.
  let serverRoot: string | null = null
  launcher.on('state', (state) => {
    if (state.activity !== 'detecting' && state.install.serverRoot !== serverRoot) {
      serverRoot = state.install.serverRoot
      void serverUpdater.check()
    }
  })
}

const UNINSTALL_SERVER_ARG = '--uninstall-server'

/**
 * Where the last backup of an uninstalled server is kept: outside its folder, which is deleted, and outside the launcher's own data, which
 * its uninstaller may delete too. The end-to-end tests set ECHOES_KEPT_BACKUPS_DIR.
 */
function keptBackupsFolder(): string {
  return process.env['ECHOES_KEPT_BACKUPS_DIR'] || join(app.getPath('documents'), 'Echoes of Atreia', 'backups')
}

const UNINSTALL_TEXTS = {
  fr: {
    question: 'Désinstaller aussi le serveur ?',
    detail: (folder: string, kept: string) =>
      `Le launcher a installé un serveur dans ${folder}. Il peut l’arrêter et supprimer ce dossier.\n\n` +
      `Une sauvegarde de vos comptes et de vos personnages est gardée dans ${kept}.`,
    yes: 'Désinstaller le serveur',
    no: 'Le garder',
    done: 'Le serveur est désinstallé.',
    kept: (kept: string) => `Vos personnages sont sauvegardés dans ${kept}.`,
    failed: 'Le serveur n’a pas été désinstallé.'
  },
  en: {
    question: 'Uninstall the server too?',
    detail: (folder: string, kept: string) =>
      `The launcher installed a server in ${folder}. It can stop it and delete that folder.\n\n` +
      `A backup of your accounts and characters is kept in ${kept}.`,
    yes: 'Uninstall the server',
    no: 'Keep it',
    done: 'The server is uninstalled.',
    kept: (kept: string) => `Your characters are backed up in ${kept}.`,
    failed: 'The server was not uninstalled.'
  }
}

/**
 * The uninstaller's question, asked only for a server the launcher installed from nothing; the answer is the person's. The end-to-end tests
 * answer it with ECHOES_FAKE_UNINSTALL_ANSWER (yes or no) and see no message.
 */
async function uninstallFromSetup(): Promise<void> {
  await settings.load()
  await launcher.initialize()
  const { install } = launcher.getState()
  if (!install.serverInstalledByLauncher || !install.serverRoot) {
    return
  }
  const texts = UNINSTALL_TEXTS[app.getLocale().toLowerCase().startsWith('fr') ? 'fr' : 'en']
  const kept = keptBackupsFolder()
  const fake = process.env['ECHOES_FAKE_UNINSTALL_ANSWER']
  const yes = fake
    ? fake === 'yes'
    : (
        await dialog.showMessageBox({
          type: 'question',
          title: 'Echoes of Atreia',
          message: texts.question,
          detail: texts.detail(install.serverRoot, kept),
          buttons: [texts.yes, texts.no],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        })
      ).response === 0
  if (!yes) {
    return
  }
  const result = await launcher.uninstallServer(backups, kept)
  if (fake) {
    return
  }
  if ('code' in result) {
    dialog.showErrorBox('Echoes of Atreia', `${texts.failed}\n\n${result.code}${result.detail ? `\n${result.detail}` : ''}`)
  } else {
    await dialog.showMessageBox({ type: 'info', title: 'Echoes of Atreia', message: texts.done, detail: texts.kept(result.kept), noLink: true })
  }
}

/** The window's bar in the launcher's colours (theme.css, .titlebar). */
const TITLE_BAR_COLOUR = '#080c1a'
const TITLE_BAR_SYMBOL = '#d8b46c'

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    minWidth: 960,
    minHeight: 640,
    title: 'Echoes of Atreia',
    backgroundColor: '#070b16',
    autoHideMenuBar: true,
    // run from its sources, electron.exe has Electron's icon: the launcher's is given (installed, the executable has it too)
    icon: appIcon,
    // The window's own bar in the launcher's colours: the page draws it, Windows keeps only its three buttons over it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: TITLE_BAR_COLOUR, symbolColor: TITLE_BAR_SYMBOL, height: TITLE_BAR_HEIGHT },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // the launcher's version, known before anything is read: the footer does not wait for the servers' detection
      additionalArguments: [`${LAUNCHER_VERSION_ARG}${app.getVersion()}`],
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  followWindowSize(window, TITLE_BAR_COLOUR, TITLE_BAR_SYMBOL)
  followFullScreen(window, (fullScreen) => {
    if (!window.isDestroyed()) {
      window.webContents.send('window:full-screen', fullScreen)
    }
  })
  window.once('ready-to-show', () => window.show())

  // Closing while servers run asks first: stop them (the game server saves the players), leave them running, or stay.
  window.on('close', (event) => {
    // A restore stopped half-way leaves one database restored and the other not: the window waits for it to end.
    // A server update stopped half-way leaves files of two versions: the window waits for it too.
    // An uninstall stopped half-way leaves a server without its MySQL, or half deleted: the window waits for it as well.
    const { activity } = launcher.getState()
    if (activity === 'restore' || activity === 'server-update' || activity === 'uninstall') {
      event.preventDefault()
      return
    }
    if (!quitAllowed && launcher.anyRunning) {
      event.preventDefault()
      launcher.setQuitRequested(true)
    }
  })

  // Links open in the system browser, never inside the launcher.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return window
}

// Run by the launcher's own uninstaller (build/installer.nsh), before it removes the launcher: no window, a question, and the server removed.
if (process.argv.includes(UNINSTALL_SERVER_ARG)) {
  void app
    .whenReady()
    .then(() => uninstallFromSetup())
    .catch((error: unknown) => dialog.showErrorBox('Echoes of Atreia', String(error)))
    .finally(() => {
      launcher.dispose()
      // whatever happened: the launcher's own uninstall goes on
      app.exit(0)
    })
  // Two launchers would each believe they own the servers: a second one only brings the first to the front.
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  // the window may be in the background, closed: one is opened again
  app.on('second-instance', () => openWindow())
  void app.whenReady().then(() => {
    presence = new TaskbarPresence(appIcon, {
      open: () => openWindow(),
      play: () => void launcher.play(),
      start: () => void launcher.startAll(),
      stop: () => void launcher.stopAll(),
      // as the window's own button: running servers are asked about first, in a window opened for it
      quit: () => openWindow().close()
    })
    presence.start()
    registerIpc(presence)
    openWindow()
    // Everything GitHub is asked is asked once, here: the start is what shows a new version. After the settings (the developer mode) and the
    // server folder (where the repositories' notes are), the server's releases once the launcher has found its folder (below).
    void settings.load()
      .then(() => launcher.initialize())
      .then(() => {
        updater.start(isDeveloperMode(settings.current))
        news.start()
        // what piles up, once a start: the archived logs past a month or a gigabyte, the reports past the ten newest
        const layout = launcher.currentLayout
        if (layout && isAutoCleanup(settings.current)) {
          // to the recycle bin; the end-to-end tests delete, so a test run leaves nothing there
          const remove = process.env['ECHOES_CLEANUP_DELETE'] ? (path: string) => rm(path) : (path: string) => shell.trashItem(path)
          void cleanUp(layout, remove).then((result) => launcher.setLastCleanup(result))
        }
        // the option asked for it: the servers that are down start, those found running are kept
        const state = launcher.getState()
        if (settings.current.startServersOnLaunch && state.install.serverFound && state.servers.game.status !== 'ready') {
          void launcher.startAll()
        }
      })
  })
}

// The update the person asked for installs once the launcher has really quit, every question answered.
app.on('will-quit', () => updater.installIfAsked())

app.on('window-all-closed', () => {
  // put in the background: the launcher stays, in the notification area
  if (inBackground) {
    return
  }
  launcher.dispose()
  app.quit()
})

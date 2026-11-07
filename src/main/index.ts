import { statfs } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { LAUNCHER_VERSION_ARG, SERVER_IDS, isBetaVersion, type FolderKind, type HomeInfo, type QuitAnswer, type ServerId } from '../shared/types'
import { AccountService } from './accounts/accountService'
import { accountStoreFor } from './accounts/accountStore'
import { BackupService } from './backup/backupService'
import { listBots } from './bots/botList'
import { setGithubCacheDir } from './github/cachedJson'
import { Launcher } from './launcher'
import { NewsFeed } from './news'
import { processMemoryMb } from './system/memory'
import { validValues } from './server/serverSettings'
import { ServerUpdater } from './serverUpdate/serverUpdater'
import { isDeveloperMode, SettingsStore } from './settings'
import { LauncherUpdater } from './update/updater'

// Lets the end-to-end tests run against a throwaway profile instead of the player's own.
const userDataDir = process.env['ECHOES_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}
// GitHub's answers kept between runs: asked again at each start with their ETag, given back when GitHub refuses
setGithubCacheDir(join(app.getPath('userData'), 'github-cache'))

const settings = new SettingsStore()
const launcher = new Launcher(settings)
const accounts = new AccountService(settings, () => launcher.currentLayout)
const backups = new BackupService(() => launcher.currentLayout)
const updater = new LauncherUpdater()
// A beta launcher installs the server's pre-releases too, a stable one its releases only: decided by its own version, with no setting.
const serverUpdater = new ServerUpdater(launcher, isBetaVersion(app.getVersion()), () => isDeveloperMode(settings.current))
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

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maxLength
// Set once the person has said what to do with running servers, so the window may close.
let quitAllowed = false

function isServerId(value: unknown): value is ServerId {
  return typeof value === 'string' && (SERVER_IDS as readonly string[]).includes(value)
}

function registerIpc(window: BrowserWindow): void {
  ipcMain.handle('launcher:get-state', () => launcher.getState())
  ipcMain.handle('launcher:get-logs', (_event, id: unknown) => (isServerId(id) ? launcher.getLogs(id) : []))
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
  ipcMain.handle('game:destinations', () => launcher.listDestinations())
  ipcMain.handle('game:teleport', async (_event, destinationId: unknown) => {
    // Through the account's state, so the stored password is checked again as for everything else the page shows.
    const character = (await accounts.getState()).selectedCharacterId
    if (!character) {
      return { code: 'no-character' }
    }
    return Number.isInteger(destinationId) ? launcher.teleport(character, destinationId as number) : { code: 'admin-failed' }
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
  ipcMain.handle('launcher:choose-folder', async (_event, kind: unknown) => {
    if (kind !== 'server' && kind !== 'client') {
      return
    }
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
    const folder = result.filePaths[0]
    if (!result.canceled && folder) {
      await launcher.chooseFolder(kind as FolderKind, folder)
    }
  })
  ipcMain.handle('launcher:choose-mysql-options', async () => {
    const result = await dialog.showOpenDialog(window, {
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
    let botsInWorld: HomeInfo['botsInWorld'] = null
    if (state.servers.game.status === 'ready') {
      const bots = await listBots(launcher.currentLayout)
      if (Array.isArray(bots)) {
        const present = bots.filter((bot) => bot.inWorld)
        botsInWorld = {
          elyos: present.filter((bot) => bot.race === 'ELYOS').length,
          asmodians: present.filter((bot) => bot.race === 'ASMODIANS').length
        }
      }
    }
    const pid = launcher.gameProcessId
    const gameMemoryMb = pid !== null && state.servers.game.status !== 'stopped' ? await processMemoryMb(pid) : null
    return { lastBackup, botsInWorld, gameMemoryMb, disk, backups: { count: backupList.length, bytes: backupBytes }, database }
  })
  ipcMain.handle('server-update:get-state', () => serverUpdater.current)
  ipcMain.handle('server-update:prepare', () => serverUpdater.prepare())
  ipcMain.handle('server-update:install', () => serverUpdater.install())
  ipcMain.handle('server-update:cancel', () => serverUpdater.cancel())
  ipcMain.handle('server-update:undo', () => serverUpdater.undo())
  ipcMain.handle('update:get-state', () => updater.current)
  // Not while servers start or stop, or the server's files change; closing then asks what to do with the running ones, as any close does.
  ipcMain.handle('update:install', () => {
    const { activity } = launcher.getState()
    if (activity === 'starting' || activity === 'stopping' || activity === 'server-update' || !updater.askInstall()) {
      return false
    }
    window.close()
    return true
  })
  ipcMain.handle('launcher:quit-answer', async (_event, answer: QuitAnswer) => {
    if (answer === 'stop' && !(await launcher.stopAll())) {
      // A server would not stop: the window stays, and its status says why.
      launcher.setQuitRequested(false)
      updater.cancelInstall()
      return
    }
    if (answer === 'stop' || answer === 'leave') {
      quitAllowed = true
      window.close()
      return
    }
    launcher.setQuitRequested(false)
    updater.cancelInstall()
  })

  launcher.on('state', (state) => window.webContents.send('launcher:state', state))
  launcher.on('lines', (batch) => window.webContents.send('launcher:lines', batch))
  updater.on('state', (state) => window.webContents.send('update:state', state))
  serverUpdater.on('state', (state) => window.webContents.send('server-update:state', state))
  news.on('state', (state) => window.webContents.send('news:state', state))
  // The server folder found at start, or chosen later: its releases are looked at again.
  let serverRoot: string | null = null
  launcher.on('state', (state) => {
    if (state.activity !== 'detecting' && state.install.serverRoot !== serverRoot) {
      serverRoot = state.install.serverRoot
      void serverUpdater.check()
    }
  })
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: 'Echoes of Atreia',
    backgroundColor: '#070b16',
    autoHideMenuBar: true,
    // The window's own bar in the launcher's colours: the page draws it, Windows keeps only its three buttons over it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#080c1a', symbolColor: '#d8b46c', height: 46 },
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

  window.once('ready-to-show', () => window.show())

  // Closing while servers run asks first: stop them (the game server saves the players), leave them running, or stay.
  window.on('close', (event) => {
    // A restore stopped half-way leaves one database restored and the other not: the window waits for it to end.
    // A server update stopped half-way leaves files of two versions: the window waits for it too.
    if (launcher.getState().activity === 'restore' || launcher.getState().activity === 'server-update') {
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

// Two launchers would each believe they own the servers: a second one only brings the first to the front.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window) {
      if (window.isMinimized()) {
        window.restore()
      }
      window.focus()
    }
  })
  void app.whenReady().then(() => {
    const window = createWindow()
    registerIpc(window)
    // Everything GitHub is asked is asked once, here: the start is what shows a new version. After the settings (the developer mode) and the
    // server folder (where the repositories' notes are), the server's releases once the launcher has found its folder (below).
    void settings.load()
      .then(() => launcher.initialize())
      .then(() => {
        updater.start(isDeveloperMode(settings.current))
        news.start()
      })
  })
}

// The update the person asked for installs once the launcher has really quit, every question answered.
app.on('will-quit', () => updater.installIfAsked())

app.on('window-all-closed', () => {
  launcher.dispose()
  app.quit()
})

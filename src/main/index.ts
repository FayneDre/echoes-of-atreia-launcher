import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { SERVER_IDS, type FolderKind, type QuitAnswer, type ServerId } from '../shared/types'
import { Launcher } from './launcher'
import { validSettings } from './server/serverSettings'

// Lets the end-to-end tests run against a throwaway profile instead of the player's own.
const userDataDir = process.env['ECHOES_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

const launcher = new Launcher()
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
  ipcMain.handle('launcher:mysql-start', () => launcher.startMysql())
  ipcMain.handle('launcher:mysql-stop', () => launcher.stopMysql())
  ipcMain.handle('launcher:play', () => launcher.play())
  ipcMain.handle('launcher:get-server-settings', () => launcher.getServerSettings())
  ipcMain.handle('launcher:save-server-settings', (_event, value: unknown) => {
    const settings = validSettings(value)
    return settings ? launcher.saveServerSettings(settings) : false
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
  ipcMain.handle('launcher:quit-answer', async (_event, answer: QuitAnswer) => {
    if (answer === 'stop' && !(await launcher.stopAll())) {
      // A server would not stop: the window stays, and its status says why.
      launcher.setQuitRequested(false)
      return
    }
    if (answer === 'stop' || answer === 'leave') {
      quitAllowed = true
      window.close()
      return
    }
    launcher.setQuitRequested(false)
  })

  launcher.on('state', (state) => window.webContents.send('launcher:state', state))
  launcher.on('lines', (batch) => window.webContents.send('launcher:lines', batch))
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'Echoes of Atreia',
    backgroundColor: '#0d1320',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  window.once('ready-to-show', () => window.show())

  // Closing while servers run asks first: stop them (the game server saves the players), leave them running, or stay.
  window.on('close', (event) => {
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
    void launcher.initialize()
  })
}

app.on('window-all-closed', () => {
  launcher.dispose()
  app.quit()
})

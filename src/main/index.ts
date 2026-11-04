import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

// Lets the end-to-end tests run against a throwaway profile instead of the player's own.
const userDataDir = process.env['ECHOES_USER_DATA_DIR']
if (userDataDir) {
  app.setPath('userData', userDataDir)
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 700,
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
}

void app.whenReady().then(createWindow)

app.on('window-all-closed', () => app.quit())

import { app, shell } from 'electron'
import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { SystemOption, SystemOptions } from '../../shared/types'

/**
 * The program Windows should start: the portable build runs from a copy it unpacks at each start, so its own file is the one named by
 * `PORTABLE_EXECUTABLE_FILE`, not the running one.
 */
function executable(): string {
  return process.env['PORTABLE_EXECUTABLE_FILE'] ?? process.execPath
}

/**
 * The shortcut's folder: the desktop, or the folder the end-to-end tests give, which also offers the shortcut to a launcher run from its
 * sources (whose program, electron.exe, is otherwise no launcher to point to).
 */
function shortcutFolder(): string | null {
  const testFolder = process.env['ECHOES_DESKTOP_DIR']
  if (testFolder) {
    return testFolder
  }
  return app.isPackaged ? app.getPath('desktop') : null
}

function shortcutPath(): string | null {
  const folder = shortcutFolder()
  return folder ? join(folder, 'Echoes of Atreia.lnk') : null
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Whether the launcher starts with Windows and has its desktop shortcut, as Windows has them now: the person may have changed either there. */
export async function readSystemOptions(): Promise<SystemOptions> {
  const shortcut = shortcutPath()
  return {
    // run from its sources, the program is electron.exe: Windows would start an empty Electron
    startWithWindows: app.isPackaged ? app.getLoginItemSettings({ path: executable() }).openAtLogin : null,
    desktopShortcut: shortcut ? await exists(shortcut) : null
  }
}

/** Turns one option on or off, when this launcher offers it. The installer names its own shortcut the same way, so it is the one removed. */
export async function setSystemOption(option: SystemOption, on: boolean): Promise<void> {
  if (option === 'startWithWindows') {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: on, path: executable() })
    }
    return
  }
  const shortcut = shortcutPath()
  if (!shortcut) {
    return
  }
  if (on) {
    shell.writeShortcutLink(shortcut, 'create', { target: executable(), description: 'Echoes of Atreia', icon: executable(), iconIndex: 0 })
  } else {
    await rm(shortcut, { force: true })
  }
}

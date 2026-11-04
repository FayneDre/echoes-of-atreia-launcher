import { app } from 'electron'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface SavedAccount {
  name: string
  /** The password encrypted by the operating system for this user (Windows DPAPI), in Base64: unreadable on another computer or account. */
  password: string
}

export interface Settings {
  serverRoot?: string
  clientRoot?: string
  accounts?: SavedAccount[]
  activeAccount?: string
  /** The character played with, by account name. */
  selectedCharacters?: Record<string, number>
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/**
 * The launcher's own settings, in its profile folder. One instance holds them for the whole launcher, so the server folders and the accounts
 * are never written from two stale copies over each other.
 */
export class SettingsStore {
  private data: Settings = {}

  async load(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(settingsFile(), 'utf8')) as Settings
    } catch {
      this.data = {}
    }
  }

  get current(): Settings {
    return this.data
  }

  /** Changes the settings and writes them at once, through a temporary file so a crash never leaves half a file. */
  async update(change: (settings: Settings) => Settings): Promise<void> {
    this.data = change(this.data)
    const file = settingsFile()
    const temporary = `${file}.tmp`
    await writeFile(temporary, JSON.stringify(this.data, null, 2), 'utf8')
    await rename(temporary, file)
  }
}

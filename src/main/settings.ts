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
  /** MySQL runs as a program with this option file (my.ini) rather than through its Windows service. */
  mysqlOptionsFile?: string
  /** The person develops the launcher and the server: GitHub is never asked, the news come from the notes of the repositories. */
  developerMode?: boolean
}

/**
 * Whether the launcher runs for a developer: as the person set it, else on for a launcher run from its sources and off for an installed one.
 * The end-to-end tests run it from its sources as a player would see it (`ECHOES_DEVELOPER_DEFAULT=off`).
 */
export function isDeveloperMode(settings: Settings): boolean {
  return settings.developerMode ?? (process.env['ECHOES_DEVELOPER_DEFAULT'] === 'off' ? false : !app.isPackaged)
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
  // Writes one after the other: two at once would share the temporary file, and one of them would fail or be lost.
  private writing: Promise<void> = Promise.resolve()

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

  /**
   * Changes the settings at once in memory, then writes them after any write still under way, through a temporary file so a crash never leaves
   * half a file. Each write takes the settings as they are when its turn comes, so the last one always holds every change.
   */
  update(change: (settings: Settings) => Settings): Promise<void> {
    this.data = change(this.data)
    const write = async (): Promise<void> => {
      const file = settingsFile()
      const temporary = `${file}.tmp`
      await writeFile(temporary, JSON.stringify(this.data, null, 2), 'utf8')
      await rename(temporary, file)
    }
    const next = this.writing.then(write, write)
    this.writing = next.catch(() => undefined)
    return next
  }
}

import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface Settings {
  serverRoot?: string
  clientRoot?: string
}

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<Settings> {
  try {
    return JSON.parse(await readFile(settingsFile(), 'utf8')) as Settings
  } catch {
    return {}
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf8')
}

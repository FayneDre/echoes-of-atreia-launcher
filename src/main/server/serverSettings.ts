import { copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ALL_SETTINGS, isAllowed, type ServerSettings, type SettingDefinition } from '../../shared/settingsCatalog'
import { applyPropertyChanges, readConfigLayers } from './properties'

const OVERRIDES = join('config', 'mygs.properties')
// A copy of the file as it was before the launcher first changed it, kept once: the person's own edits are never lost.
const BACKUP_SUFFIX = '.before-launcher'
const HEADER = '# Set from the Echoes of Atreia launcher'

/** The regular accounts' value of a setting: the first of a rate's comma separated values, one per membership level. */
function firstNumber(value: string | undefined): number | null {
  const first = Number((value ?? '').split(',')[0]?.trim())
  return value !== undefined && value.trim() !== '' && Number.isFinite(first) ? first : null
}

// Java reads "2" and "2.0" alike; the server's own files write rates with a decimal.
function formatValue(definition: SettingDefinition, value: number): string {
  if (definition.kind === 'points' || definition.kind === 'toggle') {
    return String(Math.round(value))
  }
  const rounded = Math.round(value * 1000) / 1000
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)
}

/**
 * The official value of a setting, from the server's default files. A toggle missing from them is off, as the server's own default
 * (`gameserver.character.creation.mode`, 0); any other missing setting is one this server does not have, and is not offered.
 */
function officialOf(definition: SettingDefinition, defaults: Map<string, string>): number | null {
  if (definition.kind === 'toggle') {
    return defaults.get(definition.key) === '1' ? 1 : 0
  }
  return firstNumber(defaults.get(definition.key))
}

export async function readServerSettings(gameDir: string): Promise<ServerSettings> {
  const { defaults, merged } = await readConfigLayers(gameDir)
  const values: Record<string, number> = {}
  const official: Record<string, number> = {}
  for (const definition of ALL_SETTINGS) {
    const base = officialOf(definition, defaults)
    if (base === null) {
      continue
    }
    official[definition.id] = base
    values[definition.id] =
      definition.kind === 'toggle' ? (merged.get(definition.key) === '1' ? 1 : 0) : (firstNumber(merged.get(definition.key)) ?? base)
  }
  return { values, official }
}

/** The values, or null when one is unknown or outside what the launcher offers (the interface does not send those). */
export function validValues(value: unknown): Record<string, number> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const byId = new Map(ALL_SETTINGS.map((definition) => [definition.id, definition]))
  const result: Record<string, number> = {}
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    const definition = byId.get(id)
    if (!definition || !isAllowed(definition, entry)) {
      return null
    }
    result[id] = entry
  }
  return result
}

/**
 * What to write to the overrides for these values. A value equal to the official one is removed rather than written, so the file only holds
 * what differs from the server's own configuration. A rate is written as one value, which the server applies to every membership level.
 */
export function settingChanges(values: Record<string, number>, defaults: Map<string, string>): Map<string, string | null> {
  const changes = new Map<string, string | null>()
  for (const definition of ALL_SETTINGS) {
    const value = values[definition.id]
    const base = officialOf(definition, defaults)
    if (value === undefined || base === null) {
      continue
    }
    changes.set(definition.key, value === base ? null : formatValue(definition, value))
  }
  return changes
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Writes the values to the game server's `config/mygs.properties`, never to its default files, so updating the server never conflicts with
 * them. The rest of the file is kept as it was, the file is replaced in one step, and its first version is backed up.
 */
export async function writeServerSettings(gameDir: string, values: Record<string, number>): Promise<void> {
  const { defaults } = await readConfigLayers(gameDir)
  const file = join(gameDir, OVERRIDES)
  const hadFile = await exists(file)
  // Read and written as ISO-8859-1, as Java reads it: every byte of the person's own lines comes back unchanged.
  const current = hadFile ? await readFile(file, 'latin1') : ''
  const next = applyPropertyChanges(current, settingChanges(values, defaults), HEADER)
  if (next === current) {
    return
  }
  if (hadFile && !(await exists(file + BACKUP_SUFFIX))) {
    await copyFile(file, file + BACKUP_SUFFIX)
  }
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, next, 'latin1')
  await rename(temporary, file)
}

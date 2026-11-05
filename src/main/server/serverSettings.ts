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
  switch (definition.kind) {
    case 'flag':
      return value === 1 ? 'true' : 'false'
    case 'choice':
      return definition.options![value]!
    case 'points':
    case 'toggle':
    case 'count':
      return String(Math.round(value))
    default: {
      const rounded = Math.round(value * 1000) / 1000
      return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)
    }
  }
}

/** A value as the server's file writes it, or null when it is missing or not one the setting can hold. */
function parseValue(definition: SettingDefinition, text: string | undefined): number | null {
  if (text === undefined) {
    return null
  }
  switch (definition.kind) {
    case 'toggle':
      return text.trim() === '1' ? 1 : 0
    case 'flag': {
      // As the server's BooleanTransformer: true or false in any case, or 1 or 0; anything else it refuses, so it is not a value here.
      const word = text.trim().toLowerCase()
      return word === 'true' || word === '1' ? 1 : word === 'false' || word === '0' ? 0 : null
    }
    case 'choice': {
      // As the server's EnumTransformer (Enum.valueOf): the exact spelling, so "en" is no language the server would speak.
      const index = (definition.options ?? []).indexOf(text.trim())
      return index >= 0 ? index : null
    }
    default:
      return firstNumber(text)
  }
}

/**
 * The official value of a setting, from the server's default files. A toggle missing from them is off, as the server's own default
 * (`gameserver.character.creation.mode`, 0); any other missing setting is one this server does not have (a bot option of a server older than
 * it), and is not offered.
 */
function officialOf(definition: SettingDefinition, defaults: Map<string, string>): number | null {
  if (definition.kind === 'toggle') {
    return defaults.get(definition.key) === '1' ? 1 : 0
  }
  return parseValue(definition, defaults.get(definition.key))
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
    values[definition.id] = parseValue(definition, merged.get(definition.key)) ?? base
  }
  return { values, official }
}

/** Whether one of these settings is read when the game server starts only, so that saving it while the server runs asks for a restart. */
export function needsStart(ids: string[]): boolean {
  return ALL_SETTINGS.some((definition) => definition.startOnly && ids.includes(definition.id))
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

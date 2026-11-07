import { copyFile, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ALL_SETTINGS, isAllowed, MEMBERSHIP_LEVEL, type ServerSettings, type SettingDefinition } from '../../shared/settingsCatalog'
import { applyPropertyChanges, parseProperties, readConfigLayers } from './properties'

const OVERRIDES = join('config', 'mygs.properties')
// A copy of the file as it was before the launcher first changed it, kept once: the person's own edits are never lost.
const BACKUP_SUFFIX = '.before-launcher'
const HEADER = '# Set from the Echoes of Atreia launcher'
// The rates are written to the default file that defines them (config/main/rates.properties): set in mygs.properties, they did not apply in
// game. Its first version is kept beside it, and holds the official values the page compares with.
const MAIN = join('config', 'main')

/** The server's settings, with the official values of the rates read from the copy of their file kept before the launcher first changed it. */
async function readLayers(gameDir: string): Promise<{ defaults: Map<string, string>; merged: Map<string, string>; rateFiles: Map<string, string> }> {
  const { defaults, merged } = await readConfigLayers(gameDir)
  const rateFiles = new Map<string, string>()
  const folder = join(gameDir, MAIN)
  let names: string[] = []
  try {
    names = (await readdir(folder)).filter((name) => name.endsWith('.properties')).sort()
  } catch {
    // a server without config/main has no rate to offer
  }
  const rateKeys = new Set(ALL_SETTINGS.filter((definition) => definition.membership).map((definition) => definition.key))
  for (const name of names) {
    const file = join(folder, name)
    for (const key of parseProperties(await readFile(file, 'latin1')).keys()) {
      if (rateKeys.has(key)) {
        rateFiles.set(key, file)
      }
    }
    if (await exists(file + BACKUP_SUFFIX)) {
      for (const [key, value] of parseProperties(await readFile(file + BACKUP_SUFFIX, 'latin1'))) {
        if (rateKeys.has(key)) {
          defaults.set(key, value)
        }
      }
    }
  }
  return { defaults, merged, rateFiles }
}

/** A rate's comma separated values, one per membership level. */
const partsOf = (text: string): string[] => text.split(',').map((part) => part.trim())

/**
 * The value at this level of a comma separated list, as the server picks it: the last one when the list is shorter, so a rate written as one
 * value applies to every level.
 */
function numberAt(value: string | undefined, level: number): number | null {
  if (value === undefined || value.trim() === '') {
    return null
  }
  const parts = partsOf(value)
  const number = Number(parts[Math.min(level, parts.length - 1)])
  return Number.isFinite(number) ? number : null
}

const levelOf = (definition: SettingDefinition): number => (definition.membership ? MEMBERSHIP_LEVEL[definition.membership] : 0)

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
      return numberAt(text, levelOf(definition))
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
  const { defaults, merged } = await readLayers(gameDir)
  const values: Record<string, number> = {}
  const official: Record<string, number> = {}
  const regular: Record<string, number> = {}
  for (const definition of ALL_SETTINGS) {
    const base = officialOf(definition, defaults)
    if (base === null) {
      continue
    }
    official[definition.id] = base
    values[definition.id] = parseValue(definition, merged.get(definition.key)) ?? base
    if (definition.membership) {
      regular[definition.id] = numberAt(defaults.get(definition.key), MEMBERSHIP_LEVEL.regular) ?? base
    }
  }
  return { values, official, regular }
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
 * A rate's line for these values: each level given takes its place in the list the server has now, the other levels keep theirs. Null when
 * every level is back to the official one, the line being removed then.
 */
function rateLine(levels: SettingDefinition[], values: Record<string, number>, defaults: Map<string, string>, merged: Map<string, string>): string | null {
  const key = levels[0]!.key
  const parts = partsOf(merged.get(key) ?? defaults.get(key) ?? '')
  const highest = Math.max(...levels.map(levelOf))
  while (parts.length <= highest) {
    parts.push(parts[parts.length - 1] ?? '')
  }
  for (const definition of levels) {
    const value = values[definition.id] ?? parseValue(definition, merged.get(key)) ?? officialOf(definition, defaults)!
    parts[levelOf(definition)] = formatValue(definition, value)
  }
  // official only when every level is, the ones not given here included (the bots' regular value a person set by hand)
  const officialParts = partsOf(defaults.get(key) ?? '')
  const levelCount = Math.max(parts.length, officialParts.length)
  const valueAt = (list: string[], level: number): number => Number(list[Math.min(level, list.length - 1)])
  const official = Array.from({ length: levelCount }, (_, level) => level).every((level) => valueAt(parts, level) === valueAt(officialParts, level))
  return official ? null : parts.join(', ')
}

/**
 * What to write to the overrides for these values. A value equal to the official one is removed rather than written, so the file only holds
 * what differs from the server's own configuration. A rate's levels share its line: changing one level writes the line with the others as the
 * server has them now.
 */
export function settingChanges(
  values: Record<string, number>,
  defaults: Map<string, string>,
  merged: Map<string, string> = defaults
): Map<string, string | null> {
  const changes = new Map<string, string | null>()
  const rates = new Map<string, SettingDefinition[]>()
  for (const definition of ALL_SETTINGS) {
    const value = values[definition.id]
    const base = officialOf(definition, defaults)
    if (value === undefined || base === null) {
      continue
    }
    if (definition.membership) {
      rates.set(definition.key, ALL_SETTINGS.filter((other) => other.key === definition.key && officialOf(other, defaults) !== null))
      continue
    }
    changes.set(definition.key, value === base ? null : formatValue(definition, value))
  }
  for (const [key, levels] of rates) {
    changes.set(key, rateLine(levels, values, defaults, merged))
  }
  return changes
}

/** Replaces a file in one step, its first version kept beside it once. */
async function replaceFile(file: string, next: string, hadFile: boolean): Promise<void> {
  if (hadFile && !(await exists(file + BACKUP_SUFFIX))) {
    await copyFile(file, file + BACKUP_SUFFIX)
  }
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, next, 'latin1')
  await rename(temporary, file)
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
 * Writes the rates to the default file that defines them (`config/main/rates.properties`) and every other value to `config/mygs.properties`.
 * The rest of each file is kept as it was, each is replaced in one step, and its first version is backed up (`.before-launcher`).
 */
export async function writeServerSettings(gameDir: string, values: Record<string, number>): Promise<void> {
  const { defaults, merged, rateFiles } = await readLayers(gameDir)
  const changes = settingChanges(values, defaults, merged)
  const overridesFile = join(gameDir, OVERRIDES)
  const hadOverrides = await exists(overridesFile)
  // Read and written as ISO-8859-1, as Java reads it: every byte of the person's own lines comes back unchanged.
  const currentOverrides = hadOverrides ? await readFile(overridesFile, 'latin1') : ''
  // A rate an earlier launcher left in mygs.properties moves to its file as it is: left there, it would keep winning over the file.
  for (const [key, value] of parseProperties(currentOverrides)) {
    if (rateFiles.has(key) && !changes.has(key)) {
      changes.set(key, value)
    }
  }

  // A rate goes to the file that defines it, its official line written back when it returns to it; mygs.properties loses its line, which
  // would otherwise win over the file.
  const byFile = new Map<string, Map<string, string | null>>()
  const overrides = new Map<string, string | null>()
  for (const [key, value] of changes) {
    const file = rateFiles.get(key)
    if (!file) {
      overrides.set(key, value)
      continue
    }
    const line = value ?? defaults.get(key)!
    byFile.set(file, (byFile.get(file) ?? new Map()).set(key, line))
    overrides.set(key, null)
  }
  for (const [file, fileChanges] of byFile) {
    const current = await readFile(file, 'latin1')
    const next = applyPropertyChanges(current, fileChanges, HEADER)
    if (next !== current) {
      await replaceFile(file, next, true)
    }
  }

  const next = applyPropertyChanges(currentOverrides, overrides, HEADER)
  if (next !== currentOverrides) {
    await replaceFile(overridesFile, next, hadOverrides)
  }
}

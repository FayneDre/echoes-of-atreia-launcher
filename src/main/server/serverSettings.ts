import { copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SETTING_LIMITS, type ServerSettings } from '../../shared/types'
import { applyPropertyChanges, readConfigLayers } from './properties'

// The level XP of every source; skill XP (gathering and crafting levels) is left as it is.
const XP_KEYS = [
  'gameserver.rates.xp.solo',
  'gameserver.rates.xp.group',
  'gameserver.rates.xp.quest',
  'gameserver.rates.xp.gathering',
  'gameserver.rates.xp.crafting',
  'gameserver.rates.xp.pvp'
]
// What is gained: the AP a PvP death costs (`ap.pvp.loss`) is not a reward and stays as it is.
const AP_KEYS = ['gameserver.rates.ap.pvp.gain', 'gameserver.rates.ap.pve', 'gameserver.rates.ap.quest', 'gameserver.rates.ap.dredgion']
const GP_KEYS = ['gameserver.rates.gp.gain']
// One key per Abyss rank, `gameserver.topranking.gp_loss.STAR1_OFFICER` to `...SUPREME_COMMANDER`; a rank without one loses nothing.
const GP_LOSS_PREFIX = 'gameserver.topranking.gp_loss.'
// 0: one faction per account, 1: both, 2: character reservation mode.
const FACTION_KEY = 'gameserver.character.creation.mode'

const OVERRIDES = join('config', 'mygs.properties')
// A copy of the file as it was before the launcher first changed it, kept once: the person's own edits are never lost.
const BACKUP_SUFFIX = '.before-launcher'
const HEADER = '# Set from the Echoes of Atreia launcher'

export const DEFAULT_SETTINGS: ServerSettings = { xpRate: 1, apRate: 1, gpRate: 1, gpDailyLossPercent: 100, bothFactions: false }

function parseRates(value: string | undefined): number[] {
  return (value ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((rate) => Number.isFinite(rate))
}

// Java reads "2" and "2.0" alike; the files of the server write rates with a decimal.
function formatRate(rate: number): string {
  const rounded = Math.round(rate * 1000) / 1000
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)
}

function roundMultiplier(value: number): number {
  return Math.round(value * 100) / 100
}

/** The multiplier the current value of the first of these keys applies to its default. */
function multiplierOf(keys: string[], defaults: Map<string, string>, merged: Map<string, string>): number {
  for (const key of keys) {
    const base = parseRates(defaults.get(key))[0]
    const current = parseRates(merged.get(key))[0]
    if (base !== undefined && current !== undefined && base > 0) {
      return roundMultiplier(current / base)
    }
  }
  return 1
}

function gpLossKeys(defaults: Map<string, string>): string[] {
  return [...defaults.keys()].filter((key) => key.startsWith(GP_LOSS_PREFIX))
}

export async function readServerSettings(gameDir: string): Promise<ServerSettings> {
  const { defaults, merged } = await readConfigLayers(gameDir)
  // Read from the rank that loses the most: the small losses are rounded to whole points when written (half of 9 is 5), the large one
  // keeps the percentage exact.
  let gpDailyLossPercent = 100
  let largest = 0
  for (const key of gpLossKeys(defaults)) {
    const base = Number(defaults.get(key))
    if (base > largest) {
      largest = base
      gpDailyLossPercent = Math.round((Number(merged.get(key) ?? base) / base) * 100)
    }
  }
  return {
    xpRate: multiplierOf(XP_KEYS, defaults, merged),
    apRate: multiplierOf(AP_KEYS, defaults, merged),
    gpRate: multiplierOf(GP_KEYS, defaults, merged),
    gpDailyLossPercent,
    bothFactions: merged.get(FACTION_KEY) === '1'
  }
}

/** The settings, or null when one is outside what the launcher offers (the interface should not send those). */
export function validSettings(value: unknown): ServerSettings | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const settings = value as Record<string, unknown>
  const rate = (field: unknown): field is number =>
    typeof field === 'number' && Number.isFinite(field) && field >= SETTING_LIMITS.rate.min && field <= SETTING_LIMITS.rate.max
  const loss = settings['gpDailyLossPercent']
  if (
    !rate(settings['xpRate']) ||
    !rate(settings['apRate']) ||
    !rate(settings['gpRate']) ||
    typeof loss !== 'number' ||
    !Number.isFinite(loss) ||
    loss < SETTING_LIMITS.gpDailyLossPercent.min ||
    loss > SETTING_LIMITS.gpDailyLossPercent.max ||
    typeof settings['bothFactions'] !== 'boolean'
  ) {
    return null
  }
  return {
    xpRate: settings['xpRate'],
    apRate: settings['apRate'],
    gpRate: settings['gpRate'],
    gpDailyLossPercent: loss,
    bothFactions: settings['bothFactions']
  }
}

/**
 * What to write to the overrides for these settings. A value equal to the default is removed rather than written, so the file only holds
 * what differs from the server's own configuration.
 */
export function settingChanges(settings: ServerSettings, defaults: Map<string, string>): Map<string, string | null> {
  const changes = new Map<string, string | null>()
  const scale = (keys: string[], multiplier: number): void => {
    for (const key of keys) {
      const base = parseRates(defaults.get(key))
      if (base.length > 0) {
        changes.set(key, multiplier === 1 ? null : base.map((rate) => formatRate(rate * multiplier)).join(', '))
      }
    }
  }
  scale(XP_KEYS, settings.xpRate)
  scale(AP_KEYS, settings.apRate)
  scale(GP_KEYS, settings.gpRate)

  for (const key of gpLossKeys(defaults)) {
    const base = Number(defaults.get(key))
    if (Number.isFinite(base)) {
      changes.set(key, settings.gpDailyLossPercent === 100 ? null : String(Math.round((base * settings.gpDailyLossPercent) / 100)))
    }
  }

  const mode = settings.bothFactions ? '1' : '0'
  changes.set(FACTION_KEY, (defaults.get(FACTION_KEY) ?? '0') === mode ? null : mode)
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
 * Writes the settings to the game server's `config/mygs.properties`, never to its default files, so updating the server never conflicts
 * with them. The rest of the file is kept as it was, the file is replaced in one step, and its first version is backed up.
 */
export async function writeServerSettings(gameDir: string, settings: ServerSettings): Promise<void> {
  const { defaults } = await readConfigLayers(gameDir)
  const file = join(gameDir, OVERRIDES)
  const hadFile = await exists(file)
  // Read and written as ISO-8859-1, as Java reads it: every byte of the person's own lines comes back unchanged.
  const current = hadFile ? await readFile(file, 'latin1') : ''
  const next = applyPropertyChanges(current, settingChanges(settings, defaults), HEADER)
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

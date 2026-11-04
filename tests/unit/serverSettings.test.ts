import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyPropertyChanges } from '../../src/main/server/properties'
import { DEFAULT_SETTINGS, readServerSettings, validSettings, writeServerSettings } from '../../src/main/server/serverSettings'

let gameDir: string
let overrides: string

// The default files as the server ships them, cut down to the keys the launcher sets and one it must leave alone.
function writeDefaults(): void {
  mkdirSync(join(gameDir, 'config', 'main'), { recursive: true })
  writeFileSync(
    join(gameDir, 'config', 'main', 'rates.properties'),
    [
      'gameserver.rates.xp.solo = 1.0, 2.0',
      'gameserver.rates.xp.group = 1.0, 2.0',
      'gameserver.rates.xp.quest = 1.0, 2.0',
      'gameserver.rates.xp.gathering = 1.0, 2.0',
      'gameserver.rates.xp.crafting = 1.0, 2.0',
      'gameserver.rates.xp.pvp = 1.0, 2.0',
      'gameserver.rates.ap.pvp.gain = 1.0, 2.0',
      'gameserver.rates.ap.pvp.loss = 1.0, 1.0',
      'gameserver.rates.ap.pve = 1.0, 2.0',
      'gameserver.rates.ap.quest = 1.0, 2.0',
      'gameserver.rates.ap.dredgion = 1.0, 2.0',
      'gameserver.rates.gp.gain = 1.0, 2.0',
      ''
    ].join('\n')
  )
  writeFileSync(
    join(gameDir, 'config', 'main', 'ranking.properties'),
    'gameserver.topranking.gp_loss.STAR1_OFFICER = 9\ngameserver.topranking.gp_loss.SUPREME_COMMANDER = 219\n'
  )
  writeFileSync(join(gameDir, 'config', 'main', 'gameserver.properties'), 'gameserver.character.creation.mode = 0\n')
}

beforeEach(() => {
  gameDir = mkdtempSync(join(tmpdir(), 'echoes-settings-'))
  overrides = join(gameDir, 'config', 'mygs.properties')
  writeDefaults()
})

afterEach(() => rmSync(gameDir, { recursive: true, force: true }))

const read = (): string => readFileSync(overrides, 'latin1')

describe('server settings', () => {
  it('reads the official values when nothing overrides them', async () => {
    expect(await readServerSettings(gameDir)).toEqual(DEFAULT_SETTINGS)
  })

  it('writes every rate as a multiple of its default, for each membership level, and reads it back', async () => {
    const settings = { xpRate: 3, apRate: 1.5, gpRate: 2, gpDailyLossPercent: 50, bothFactions: true }
    await writeServerSettings(gameDir, settings)

    const text = read()
    expect(text).toContain('gameserver.rates.xp.solo = 3.0, 6.0')
    expect(text).toContain('gameserver.rates.xp.pvp = 3.0, 6.0')
    expect(text).toContain('gameserver.rates.ap.pve = 1.5, 3.0')
    expect(text).toContain('gameserver.rates.gp.gain = 2.0, 4.0')
    expect(text).toContain('gameserver.topranking.gp_loss.STAR1_OFFICER = 5')
    expect(text).toContain('gameserver.topranking.gp_loss.SUPREME_COMMANDER = 110')
    expect(text).toContain('gameserver.character.creation.mode = 1')
    // What a PvP death costs is not a reward: left as it is.
    expect(text).not.toContain('ap.pvp.loss')
    expect(await readServerSettings(gameDir)).toEqual(settings)
  })

  it('turns the daily Glory Point loss off at 0 %', async () => {
    await writeServerSettings(gameDir, { ...DEFAULT_SETTINGS, gpDailyLossPercent: 0 })
    expect(read()).toContain('gameserver.topranking.gp_loss.SUPREME_COMMANDER = 0')
    expect((await readServerSettings(gameDir)).gpDailyLossPercent).toBe(0)
  })

  it('keeps the rest of the file byte for byte, replaces a key in place, and backs the first version up once', async () => {
    const original = Buffer.from(
      '# réglages locaux\r\ndatabase.user = aion\r\ngameserver.rates.xp.solo = 2.0, 4.0\r\n# fin\r\n',
      'latin1'
    )
    writeFileSync(overrides, original)

    await writeServerSettings(gameDir, { ...DEFAULT_SETTINGS, xpRate: 5 })
    const lines = read().split('\r\n')
    expect(lines[0]).toBe('# réglages locaux')
    expect(lines[1]).toBe('database.user = aion')
    // Replaced where it was, not added a second time at the end.
    expect(lines[2]).toBe('gameserver.rates.xp.solo = 5.0, 10.0')
    expect(lines[3]).toBe('# fin')
    expect(read().match(/gameserver\.rates\.xp\.solo/g)).toHaveLength(1)
    expect(read()).not.toMatch(/[^\r]\n/)

    const backup = overrides + '.before-launcher'
    expect(readFileSync(backup)).toEqual(original)
    await writeServerSettings(gameDir, { ...DEFAULT_SETTINGS, xpRate: 7 })
    expect(readFileSync(backup)).toEqual(original)
  })

  it('removes what is back to the official value, leaving only the person’s own lines', async () => {
    writeFileSync(overrides, 'database.user = aion\n', 'latin1')
    await writeServerSettings(gameDir, { ...DEFAULT_SETTINGS, xpRate: 4, bothFactions: true })
    await writeServerSettings(gameDir, DEFAULT_SETTINGS)
    expect(read()).not.toContain('gameserver.rates')
    expect(read()).not.toContain('creation.mode')
    expect(read()).toContain('database.user = aion')
  })

  it('creates the overrides file when there is none, and does not back up what did not exist', async () => {
    await writeServerSettings(gameDir, { ...DEFAULT_SETTINGS, apRate: 2 })
    expect(read()).toContain('# Set from the Echoes of Atreia launcher')
    expect(existsSync(overrides + '.before-launcher')).toBe(false)
  })

  it('accepts only settings within what the launcher offers', () => {
    expect(validSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS)
    expect(validSettings({ ...DEFAULT_SETTINGS, xpRate: 0 })).toBeNull()
    expect(validSettings({ ...DEFAULT_SETTINGS, xpRate: Number.NaN })).toBeNull()
    expect(validSettings({ ...DEFAULT_SETTINGS, apRate: 1000 })).toBeNull()
    expect(validSettings({ ...DEFAULT_SETTINGS, gpDailyLossPercent: 101 })).toBeNull()
    expect(validSettings({ ...DEFAULT_SETTINGS, bothFactions: 'yes' })).toBeNull()
    expect(validSettings('nonsense')).toBeNull()
  })
})

describe('applyPropertyChanges', () => {
  it('adds the header once, however many times it writes', () => {
    const header = '# header'
    const once = applyPropertyChanges('a = 1\n', new Map([['b', '2']]), header)
    const twice = applyPropertyChanges(once, new Map([['c', '3']]), header)
    expect(twice).toBe('a = 1\n\n# header\nb = 2\nc = 3\n')
  })

  it('collapses duplicate lines of a key into one', () => {
    expect(applyPropertyChanges('k = 1\nk = 2\n', new Map([['k', '3']]), '#')).toBe('k = 3\n')
  })
})

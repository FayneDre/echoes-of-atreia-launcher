import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyPropertyChanges } from '../../src/main/server/properties'
import { needsStart, readServerSettings, validValues, writeServerSettings } from '../../src/main/server/serverSettings'
import { en } from '../../src/renderer/src/i18n/en'
import { fr } from '../../src/renderer/src/i18n/fr'
import { ALL_SETTINGS, SETTING_GROUPS } from '../../src/shared/settingsCatalog'

let gameDir: string
let overrides: string

// The default files as the server ships them, cut down: a few of the rates, two of the ranks, the faction mode.
function writeDefaults(): void {
  mkdirSync(join(gameDir, 'config', 'main'), { recursive: true })
  writeFileSync(
    join(gameDir, 'config', 'main', 'rates.properties'),
    [
      'gameserver.rates.xp.solo = 1.0, 2.0',
      'gameserver.rates.xp.group = 1.0, 2.0',
      'gameserver.rates.ap.pvp.loss = 1.0, 1.0',
      'gameserver.rates.manastone_chances = 75.0, 75.0',
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

describe('the catalog', () => {
  it('has a label for every group and setting, in both languages', () => {
    const keys = [...SETTING_GROUPS.map((group) => `group.${group.id}`), ...ALL_SETTINGS.map((setting) => `setting.${setting.id}`)]
    expect(keys.filter((key) => !(key in en))).toEqual([])
    expect(keys.filter((key) => !(key in fr))).toEqual([])
  })

  it('names every setting once', () => {
    expect(new Set(ALL_SETTINGS.map((setting) => setting.id)).size).toBe(ALL_SETTINGS.length)
    expect(new Set(ALL_SETTINGS.map((setting) => setting.key)).size).toBe(ALL_SETTINGS.length)
  })
})

describe('server settings', () => {
  it('offers only what the server files have, at their official values for regular accounts', async () => {
    const settings = await readServerSettings(gameDir)
    expect(settings.official).toEqual({
      'xp.solo': 1,
      'xp.group': 1,
      'ap.pvp.loss': 1,
      manastone_chances: 75,
      'gp_loss.STAR1_OFFICER': 9,
      'gp_loss.SUPREME_COMMANDER': 219,
      bothFactions: 0
    })
    expect(settings.values).toEqual(settings.official)
  })

  it('writes each setting as one value, which the server applies to every membership level, and reads it back', async () => {
    const values = {
      'xp.solo': 3,
      'xp.group': 1.5,
      'ap.pvp.loss': 0,
      manastone_chances: 100,
      'gp_loss.STAR1_OFFICER': 5,
      'gp_loss.SUPREME_COMMANDER': 0,
      bothFactions: 1
    }
    await writeServerSettings(gameDir, values)

    const text = read()
    expect(text).toContain('gameserver.rates.xp.solo = 3.0\n')
    expect(text).toContain('gameserver.rates.xp.group = 1.5\n')
    expect(text).toContain('gameserver.rates.ap.pvp.loss = 0.0\n')
    expect(text).toContain('gameserver.rates.manastone_chances = 100.0\n')
    expect(text).toContain('gameserver.topranking.gp_loss.STAR1_OFFICER = 5\n')
    expect(text).toContain('gameserver.topranking.gp_loss.SUPREME_COMMANDER = 0\n')
    expect(text).toContain('gameserver.character.creation.mode = 1\n')
    expect((await readServerSettings(gameDir)).values).toEqual(values)
  })

  it('reads a rate an earlier version wrote for both membership levels by its regular value', async () => {
    writeFileSync(overrides, 'gameserver.rates.xp.solo = 2.0, 4.0\n', 'latin1')
    expect((await readServerSettings(gameDir)).values['xp.solo']).toBe(2)
    await writeServerSettings(gameDir, { 'xp.solo': 2 })
    expect(read()).toBe('gameserver.rates.xp.solo = 2.0\n')
  })

  it('leaves alone the settings it was not given', async () => {
    writeFileSync(overrides, 'gameserver.rates.xp.group = 7.0\n', 'latin1')
    await writeServerSettings(gameDir, { 'xp.solo': 2 })
    expect(read()).toContain('gameserver.rates.xp.group = 7.0')
  })

  it('keeps the rest of the file byte for byte, replaces a key in place, and backs the first version up once', async () => {
    const original = Buffer.from('# réglages locaux\r\ndatabase.user = aion\r\ngameserver.rates.xp.solo = 2.0, 4.0\r\n# fin\r\n', 'latin1')
    writeFileSync(overrides, original)

    await writeServerSettings(gameDir, { 'xp.solo': 5 })
    const lines = read().split('\r\n')
    expect(lines[0]).toBe('# réglages locaux')
    expect(lines[1]).toBe('database.user = aion')
    // Replaced where it was, not added a second time at the end.
    expect(lines[2]).toBe('gameserver.rates.xp.solo = 5.0')
    expect(lines[3]).toBe('# fin')
    expect(read().match(/gameserver\.rates\.xp\.solo/g)).toHaveLength(1)
    expect(read()).not.toMatch(/[^\r]\n/)

    const backup = overrides + '.before-launcher'
    expect(readFileSync(backup)).toEqual(original)
    await writeServerSettings(gameDir, { 'xp.solo': 7 })
    expect(readFileSync(backup)).toEqual(original)
  })

  it('removes what is back to the official value, leaving only the person’s own lines', async () => {
    writeFileSync(overrides, 'database.user = aion\n', 'latin1')
    await writeServerSettings(gameDir, { 'xp.solo': 4, bothFactions: 1 })
    await writeServerSettings(gameDir, (await readServerSettings(gameDir)).official)
    expect(read()).toBe('database.user = aion\n')
  })

  it('creates the overrides file when there is none, and does not back up what did not exist', async () => {
    await writeServerSettings(gameDir, { 'xp.group': 2 })
    expect(read()).toContain('# Set from the Echoes of Atreia launcher')
    expect(existsSync(overrides + '.before-launcher')).toBe(false)
  })

  it('accepts only known settings within what the launcher offers', () => {
    expect(validValues({ 'xp.solo': 2, manastone_chances: 100, 'gp_loss.GENERAL': 50, bothFactions: 1 })).not.toBeNull()
    expect(validValues({ 'ap.pvp.loss': 0 })).not.toBeNull()
    expect(validValues({ 'xp.solo': -1 })).toBeNull()
    expect(validValues({ 'xp.solo': 101 })).toBeNull()
    expect(validValues({ 'xp.solo': Number.NaN })).toBeNull()
    expect(validValues({ manastone_chances: 120 })).toBeNull()
    expect(validValues({ 'gp_loss.GENERAL': 2.5 })).toBeNull()
    expect(validValues({ bothFactions: 2 })).toBeNull()
    expect(validValues({ 'database.user': 1 })).toBeNull()
    expect(validValues(['xp.solo'])).toBeNull()
    expect(validValues('nonsense')).toBeNull()
  })
})

describe('bot settings', () => {
  beforeEach(() =>
    writeFileSync(
      join(gameDir, 'config', 'main', 'playerbot.properties'),
      [
        'gameserver.playerbot.xp.solo = 1',
        'gameserver.playerbot.pvp.enable = true',
        'gameserver.playerbot.chat.enable = True',
        'gameserver.playerbot.chat.language = FR',
        'gameserver.playerbot.broker.buyer.daily_kinah = 200000000',
        ''
      ].join('\n')
    )
  )

  it('reads switches written true or false, a choice by its index and a count as it is', async () => {
    const { official } = await readServerSettings(gameDir)
    expect(official['bots.xp.solo']).toBe(1)
    expect(official['bots.pvp.enable']).toBe(1)
    expect(official['bots.chat.enable']).toBe(1)
    expect(official['bots.chat.language']).toBe(0)
    expect(official['bots.broker.buyer.daily_kinah']).toBe(200_000_000)
    // A server older than an option does not have it, and it is not offered.
    expect(official['bots.pvp.share.fighter']).toBeUndefined()
  })

  it('writes them back as the server reads them', async () => {
    await writeServerSettings(gameDir, { 'bots.xp.solo': 5, 'bots.pvp.enable': 0, 'bots.chat.language': 1, 'bots.broker.buyer.daily_kinah': 1_000_000 })
    const text = read()
    expect(text).toContain('gameserver.playerbot.xp.solo = 5\n')
    expect(text).toContain('gameserver.playerbot.pvp.enable = false\n')
    expect(text).toContain('gameserver.playerbot.chat.language = EN\n')
    expect(text).toContain('gameserver.playerbot.broker.buyer.daily_kinah = 1000000\n')
    const { values } = await readServerSettings(gameDir)
    expect(values['bots.pvp.enable']).toBe(0)
    expect(values['bots.chat.language']).toBe(1)
    // Back to the official value: nothing of it is left in the overrides.
    await writeServerSettings(gameDir, { 'bots.chat.language': 0 })
    expect(read()).not.toContain('chat.language')
  })

  it('takes a language the overrides spell in lower case, and falls back to the official one for an unknown', async () => {
    writeFileSync(overrides, 'gameserver.playerbot.chat.language = en\n', 'latin1')
    expect((await readServerSettings(gameDir)).values['bots.chat.language']).toBe(1)
    writeFileSync(overrides, 'gameserver.playerbot.chat.language = DE\n', 'latin1')
    expect((await readServerSettings(gameDir)).values['bots.chat.language']).toBe(0)
  })

  it('keeps each count within its own bounds', () => {
    expect(validValues({ 'bots.xp.solo': 1, 'bots.xp.pvp': 0, 'bots.broker.size': 6000 })).not.toBeNull()
    expect(validValues({ 'bots.xp.solo': 0 })).toBeNull()
    expect(validValues({ 'bots.xp.solo': 1.5 })).toBeNull()
    expect(validValues({ 'bots.broker.size': 5000 })).toBeNull()
    expect(validValues({ 'bots.chat.language': 2 })).toBeNull()
    expect(validValues({ 'bots.pvp.enable': 1 })).not.toBeNull()
  })

  it('knows which settings wait for a start', () => {
    expect(needsStart(['bots.xp.solo', 'xp.solo'])).toBe(false)
    expect(needsStart(['bots.xp.solo', 'bots.broker.enable'])).toBe(true)
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

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyPropertyChanges } from '../../src/main/server/properties'
import { needsStart, readServerSettings, validValues, writeLoginCommand, writeServerSettings, writeStaffTag } from '../../src/main/server/serverSettings'
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
const ratesPath = (): string => join(gameDir, 'config', 'main', 'rates.properties')
const readRates = (): string => readFileSync(ratesPath(), 'latin1')

describe('the catalog', () => {
  it('has a label for every group and setting, in both languages', () => {
    const keys = [...SETTING_GROUPS.map((group) => `group.${group.id}`), ...ALL_SETTINGS.map((setting) => `setting.${setting.id}`)]
    expect(keys.filter((key) => !(key in en))).toEqual([])
    expect(keys.filter((key) => !(key in fr))).toEqual([])
  })

  it('names every setting once, and sets every rate for premium accounts', () => {
    expect(new Set(ALL_SETTINGS.map((setting) => setting.id)).size).toBe(ALL_SETTINGS.length)
    expect(new Set(ALL_SETTINGS.map((setting) => setting.key)).size).toBe(ALL_SETTINGS.length)
    for (const setting of ALL_SETTINGS.filter((definition) => definition.key.startsWith('gameserver.rates.'))) {
      expect(setting.membership).toBe('premium')
    }
  })
})

describe('server settings', () => {
  it('offers only what the server files have, at their official values for premium accounts, and the regular ones beside', async () => {
    const settings = await readServerSettings(gameDir)
    expect(settings.official).toEqual({
      'xp.solo': 2,
      'xp.group': 2,
      'ap.pvp.loss': 1,
      manastone_chances: 75,
      'gp_loss.STAR1_OFFICER': 9,
      'gp_loss.SUPREME_COMMANDER': 219,
      bothFactions: 0
    })
    expect(settings.regular).toEqual({ 'xp.solo': 1, 'xp.group': 1, 'ap.pvp.loss': 1, manastone_chances: 75 })
    expect(settings.values).toEqual(settings.official)
  })

  it('writes a rate as its premium value, keeping the regular one, and reads it back', async () => {
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

    // the rates in the file that defines them, the rest in mygs.properties
    const rates = readRates()
    expect(rates).toContain('gameserver.rates.xp.solo = 1.0, 3.0\n')
    expect(rates).toContain('gameserver.rates.xp.group = 1.0, 1.5\n')
    expect(rates).toContain('gameserver.rates.ap.pvp.loss = 1.0, 0.0\n')
    expect(rates).toContain('gameserver.rates.manastone_chances = 75.0, 100.0\n')
    const text = read()
    expect(text).not.toContain('gameserver.rates')
    expect(text).toContain('gameserver.topranking.gp_loss.STAR1_OFFICER = 5\n')
    expect(text).toContain('gameserver.topranking.gp_loss.SUPREME_COMMANDER = 0\n')
    expect(text).toContain('gameserver.character.creation.mode = 1\n')
    const read2 = await readServerSettings(gameDir)
    expect(read2.values).toEqual(values)
    // the official values stay the server's own, read from the copy kept before the first change
    expect(read2.official['xp.solo']).toBe(2)
    expect(read2.regular['xp.solo']).toBe(1)
  })

  it('reads a rate an earlier launcher wrote to mygs.properties, and moves it to the rates file at the next save', async () => {
    writeFileSync(overrides, 'database.user = aion\ngameserver.rates.xp.solo = 3.0\n', 'latin1')
    expect((await readServerSettings(gameDir)).values['xp.solo']).toBe(3)
    await writeServerSettings(gameDir, { 'xp.solo': 5 })
    // the regular value the line held is kept
    expect(readRates()).toContain('gameserver.rates.xp.solo = 3.0, 5.0\n')
    expect(read()).toBe('database.user = aion\n')
  })

  it('writes a rate back to its official line, keeping the file as the server shipped it, backed up once', async () => {
    const original = readFileSync(ratesPath())
    await writeServerSettings(gameDir, { 'xp.solo': 5 })
    expect(readRates()).toContain('gameserver.rates.xp.solo = 1.0, 5.0\n')
    expect(readFileSync(ratesPath() + '.before-launcher')).toEqual(original)
    await writeServerSettings(gameDir, { 'xp.solo': 7 })
    expect(readFileSync(ratesPath() + '.before-launcher')).toEqual(original)
    await writeServerSettings(gameDir, { 'xp.solo': 2 })
    expect(readFileSync(ratesPath())).toEqual(original)
  })

  it('leaves alone the settings it was not given, and moves to their file the rates mygs.properties still holds', async () => {
    writeFileSync(overrides, 'gameserver.rates.xp.group = 7.0\ngameserver.character.creation.mode = 2\n', 'latin1')
    await writeServerSettings(gameDir, { 'xp.solo': 3 })
    expect(read()).toBe('gameserver.character.creation.mode = 2\n')
    expect(readRates()).toContain('gameserver.rates.xp.group = 7.0\n')
  })

  it('keeps the rest of mygs.properties byte for byte, replaces a key in place, and backs the first version up once', async () => {
    const original = Buffer.from('# réglages locaux\r\ndatabase.user = aion\r\ngameserver.topranking.gp_loss.STAR1_OFFICER = 4\r\n# fin\r\n', 'latin1')
    writeFileSync(overrides, original)

    await writeServerSettings(gameDir, { 'gp_loss.STAR1_OFFICER': 5 })
    const lines = read().split('\r\n')
    expect(lines[0]).toBe('# réglages locaux')
    expect(lines[1]).toBe('database.user = aion')
    // Replaced where it was, not added a second time at the end.
    expect(lines[2]).toBe('gameserver.topranking.gp_loss.STAR1_OFFICER = 5')
    expect(lines[3]).toBe('# fin')
    expect(read().match(/STAR1_OFFICER/g)).toHaveLength(1)
    expect(read()).not.toMatch(/[^\r]\n/)

    const backup = overrides + '.before-launcher'
    expect(readFileSync(backup)).toEqual(original)
    await writeServerSettings(gameDir, { 'gp_loss.STAR1_OFFICER': 7 })
    expect(readFileSync(backup)).toEqual(original)
  })

  it('removes what is back to the official value, leaving only the person’s own lines', async () => {
    writeFileSync(overrides, 'database.user = aion\n', 'latin1')
    const rates = readFileSync(ratesPath())
    await writeServerSettings(gameDir, { 'xp.solo': 4, bothFactions: 1 })
    await writeServerSettings(gameDir, (await readServerSettings(gameDir)).official)
    expect(read()).toBe('database.user = aion\n')
    expect(readFileSync(ratesPath())).toEqual(rates)
  })

  it('shortens the dungeon re-entry for every account and bot, and takes both lines away at the official value', async () => {
    writeFileSync(join(gameDir, 'config', 'main', 'instance.properties'), 'gameserver.instance.cooldown_rate = 1\n')
    writeFileSync(join(gameDir, 'config', 'main', 'membership.properties'), 'gameserver.instances.cooldown = 10\n')
    const settings = await readServerSettings(gameDir)
    expect(settings.official['instance.cooldown']).toBe(0)
    // "None" is the last option, written 0: the server reads it as no wait at all
    await writeServerSettings(gameDir, { 'instance.cooldown': 5 })
    expect(read()).toMatch(/^gameserver\.instance\.cooldown_rate = 0$/m)
    // the server applies the rate from this membership up, 10 by default: nobody's
    expect(read()).toMatch(/^gameserver\.instances\.cooldown = 0$/m)
    expect((await readServerSettings(gameDir)).values['instance.cooldown']).toBe(5)
    await writeServerSettings(gameDir, { 'instance.cooldown': 0 })
    expect(read()).not.toContain('cooldown')
  })

  it('creates the overrides file when there is none, and does not back up what did not exist', async () => {
    await writeServerSettings(gameDir, { bothFactions: 1 })
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

  it('reads a language and a switch as the server does', async () => {
    // The server's Enum.valueOf takes the exact spelling only: "en" is refused there, so it does not read as English here.
    writeFileSync(overrides, 'gameserver.playerbot.chat.language = EN\n', 'latin1')
    expect((await readServerSettings(gameDir)).values['bots.chat.language']).toBe(1)
    writeFileSync(overrides, 'gameserver.playerbot.chat.language = en\n', 'latin1')
    expect((await readServerSettings(gameDir)).values['bots.chat.language']).toBe(0)
    // The server's boolean takes 1 and 0 as well as true and false.
    writeFileSync(overrides, 'gameserver.playerbot.pvp.enable = 0\ngameserver.playerbot.chat.enable = 1\n', 'latin1')
    const { values } = await readServerSettings(gameDir)
    expect(values['bots.pvp.enable']).toBe(0)
    expect(values['bots.chat.enable']).toBe(1)
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

describe('writeLoginCommand', () => {
  const key = 'gameserver.administration.login.execute_commands'
  const line = (): string | undefined =>
    readFileSync(overrides, 'latin1')
      .split('\n')
      .find((text) => text.startsWith(key))

  beforeEach(() => {
    mkdirSync(join(gameDir, 'config', 'administration'), { recursive: true })
    writeFileSync(join(gameDir, 'config', 'administration', 'admin.properties'), `${key} = //invis, //invul, //enemy none, //see\n`)
  })

  it('takes a mode out of the login commands, and an empty list is written as one', async () => {
    await writeLoginCommand(gameDir, '//invis', false)
    expect(line()).toBe(`${key} = //invul, //enemy none, //see`)
    for (const command of ['//invul', '//enemy none', '//see']) {
      await writeLoginCommand(gameDir, command, false)
    }
    expect(line()).toBe(`${key} = `)
  })

  it('drops its line once the commands are the default ones again, in whatever order', async () => {
    await writeLoginCommand(gameDir, '//invis', false)
    await writeLoginCommand(gameDir, '//invis', true)
    expect(line()).toBeUndefined()
  })

  it('keeps the commands added by hand, and never lists one twice', async () => {
    writeFileSync(overrides, `${key} = //invis, //see, //speed 50\n`)
    await writeLoginCommand(gameDir, '//see', true)
    await writeLoginCommand(gameDir, '//invis', false)
    expect(line()).toBe(`${key} = //see, //speed 50`)
  })
})

describe('a settings file another program holds open', () => {
  // Java opens a file without sharing its deletion, which keeps Windows from replacing it; PowerShell's FileShare.ReadWrite does the same.
  it.skipIf(process.platform !== 'win32')('is written once that program lets it go, within about two seconds', async () => {
    writeFileSync(overrides, 'database.user = aion\n')
    const holder = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `$f = [IO.File]::Open('${overrides}', 'Open', 'Read', 'ReadWrite'); 'open'; Start-Sleep -Milliseconds 800; $f.Close()`
    ])
    await new Promise<void>((resolve) => holder.stdout.on('data', (data: Buffer) => data.toString().includes('open') && resolve()))
    await writeStaffTag(gameDir, false)
    expect(readFileSync(overrides, 'latin1')).toContain('gameserver.administration.customtags.enable = false')
    expect(readFileSync(overrides, 'latin1')).toContain('database.user = aion')
  }, 15_000)
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clientArguments } from '../../src/main/client'
import { mysqlAddressOf, parseProperties, portOf, readServerConfig } from '../../src/main/server/properties'
import { fitHeapToMachine, heapMegabytesFor, javaArgumentsFrom, tokenizeArguments } from '../../src/main/server/startScript'
import { parseJavaMajor } from '../../src/main/system/java'

// The game server's start.bat as the server ships it.
const GAME_START_BAT = `@ECHO off
:: Run in Windows Terminal if available
IF "%WT_SESSION%" == "" wt %0 2>nul && EXIT
TITLE Aion Emu - Game Server

:START
CLS
JAVA -Xms1024m -Xmx2560m -XX:+UseNUMA -XX:+UseCompactObjectHeaders -DconsoleEncoding=CP850 -cp "libs/*" com.aionemu.gameserver.GameServer
IF %ERRORLEVEL% EQU 0 GOTO END
`

describe('start.bat', () => {
  it('reads the java arguments, quotes removed', () => {
    expect(javaArgumentsFrom(GAME_START_BAT)).toEqual([
      '-Xms1024m',
      '-Xmx2560m',
      '-XX:+UseNUMA',
      '-XX:+UseCompactObjectHeaders',
      '-DconsoleEncoding=CP850',
      '-cp',
      'libs/*',
      'com.aionemu.gameserver.GameServer'
    ])
  })

  it('has no arguments when there is no JAVA line', () => {
    expect(javaArgumentsFrom('@ECHO off\r\nPAUSE\r\n')).toBeNull()
  })

  it('keeps quoted spaces together', () => {
    expect(tokenizeArguments('-cp "C:/Program Files/x/*" Main')).toEqual(['-cp', 'C:/Program Files/x/*', 'Main'])
    expect(tokenizeArguments('a "" b')).toEqual(['a', '', 'b'])
  })
})

describe('properties', () => {
  it('reads keys and values, skipping comments', () => {
    const parsed = parseProperties('# comment\n! other\nkey = value\r\naddress=0.0.0.0:9021\n\nempty =\n')
    expect(parsed.get('key')).toBe('value')
    expect(parsed.get('address')).toBe('0.0.0.0:9021')
    expect(parsed.get('empty')).toBe('')
    expect(parsed.size).toBe(3)
  })

  it('reads ports and database addresses', () => {
    expect(portOf('0.0.0.0:7777')).toBe(7777)
    expect(portOf(undefined)).toBeNull()
    expect(mysqlAddressOf('jdbc:mysql://localhost:3306/aion_gs?serverTimezone=x')).toEqual({ host: 'localhost', port: 3306 })
    expect(mysqlAddressOf('jdbc:mysql://db.local/aion_gs')).toEqual({ host: 'db.local', port: 3306 })
    expect(mysqlAddressOf('nonsense')).toBeNull()
  })

  describe('a server folder', () => {
    let dir: string
    afterEach(() => rmSync(dir, { recursive: true, force: true }))

    it('lets mygs.properties override the defaults, whatever the file names', () => {
      dir = mkdtempSync(join(tmpdir(), 'echoes-unit-'))
      mkdirSync(join(dir, 'config', 'network'), { recursive: true })
      mkdirSync(join(dir, 'config', 'main'), { recursive: true })
      writeFileSync(join(dir, 'config', 'network', 'network.properties'), 'gameserver.network.client.socket_address = 0.0.0.0:7777\n')
      writeFileSync(join(dir, 'config', 'main', 'zzz.properties'), 'gameserver.rates.xp.solo = 1.0\n')
      writeFileSync(join(dir, 'config', 'mygs.properties'), 'gameserver.network.client.socket_address = 0.0.0.0:8888\n')

      return readServerConfig(dir).then((config) => {
        expect(config.get('gameserver.network.client.socket_address')).toBe('0.0.0.0:8888')
        expect(config.get('gameserver.rates.xp.solo')).toBe('1.0')
      })
    })
  })
})

describe('java', () => {
  it('reads the major version of modern and old Java', () => {
    expect(parseJavaMajor('openjdk version "25.0.1" 2025-10-21\nOpenJDK Runtime Environment')).toBe(25)
    expect(parseJavaMajor('java version "1.8.0_401"')).toBe(8)
    expect(parseJavaMajor("'java' is not recognized")).toBeNull()
  })
})

describe('client', () => {
  it('reaches the local login server on its client port', () => {
    expect(clientArguments(2106, 'FRA')).toEqual(['-ip:127.0.0.1', '-port:2106', '-loginex', '-lang:FRA'])
  })
})

describe('fitHeapToMachine', () => {
  const GB = 1024 ** 3
  const script = ['-Xms1024m', '-Xmx2560m', '-XX:+UseNUMA', '-cp', 'libs/*', 'com.aionemu.gameserver.GameServer']

  it('gives a smaller machine a smaller heap, by the bands Windows reports', () => {
    expect(heapMegabytesFor(3.9 * GB)).toBe(1024)
    expect(heapMegabytesFor(7.8 * GB)).toBe(1536)
    expect(heapMegabytesFor(11.8 * GB)).toBe(2048)
    expect(heapMegabytesFor(15.2 * GB)).toBeNull()
  })
  it('brings the maximum down and the initial size with it', () => {
    expect(fitHeapToMachine(script, 7.8 * GB)).toEqual(['-Xms1024m', '-Xmx1536m', '-XX:+UseNUMA', '-cp', 'libs/*', 'com.aionemu.gameserver.GameServer'])
    expect(fitHeapToMachine(script, 3.9 * GB).slice(0, 2)).toEqual(['-Xms1024m', '-Xmx1024m'])
    expect(fitHeapToMachine(['-Xms2g', '-Xmx3g', 'Main'], 3.9 * GB)).toEqual(['-Xms1024m', '-Xmx1024m', 'Main'])
  })
  it('never raises what start.bat says, and leaves a script without a maximum alone', () => {
    expect(fitHeapToMachine(script, 15.2 * GB)).toBe(script)
    expect(fitHeapToMachine(['-Xmx1g', 'Main'], 7.8 * GB)).toEqual(['-Xmx1g', 'Main'])
    expect(fitHeapToMachine(['-cp', 'libs/*', 'Main'], 3.9 * GB)).toEqual(['-cp', 'libs/*', 'Main'])
  })
})

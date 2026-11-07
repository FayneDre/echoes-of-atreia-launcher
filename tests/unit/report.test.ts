import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yauzl from 'yauzl'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { botNotes, createReport, issueUrl, reportStamp, reportSummary, withoutProfile, type ReportContext } from '../../src/main/report'
import type { ServerLayout } from '../../src/main/server/installation'
import type { LauncherState } from '../../src/shared/types'

const state: LauncherState = {
  install: { serverRoot: 'D:/server', serverFound: true, clientRoot: 'D:/client', clientFound: true, javaVersion: 25, clientMissing: [], clientPacks: [], clientLanguage: null },
  mysql: { status: 'ready', serviceName: 'MySQL84', optionsFile: null, port: 3306 },
  servers: {
    chat: { id: 'chat', status: 'ready', external: false, port: 9021 },
    login: { id: 'login', status: 'ready', external: false, port: 9014 },
    game: { id: 'game', status: 'failed', external: false, port: null, problem: { code: 'start-crashed', detail: 'NullPointerException' } }
  },
  activity: 'idle',
  quitRequested: false,
  restartNeeded: false,
  serverVersion: { from: 'manifest', version: 'v0.1.0-beta.2', revision: 'c979e97', apiLevel: 1 },
  developerMode: false,
  startServersOnLaunch: false,
  autoCleanup: true,
  lastCleanup: null
}

const context: ReportContext = {
  launcherVersion: '0.3.0-beta.4',
  state,
  serverUpdate: { status: 'current', installed: 'v0.1.0-beta.2' },
  character: {
    id: 1,
    name: 'Nemesis',
    level: 36,
    playerClass: 'ASSASSIN',
    race: 'ASMODIANS',
    gender: 'FEMALE',
    mapName: 'Morheim',
    online: false,
    deleting: false
  },
  botsInWorld: null,
  language: 'fr'
}

function entries(zipPath: string): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error)
        return
      }
      const found = new Map<string, string>()
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError)
            return
          }
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            found.set(entry.fileName, Buffer.concat(chunks).toString('utf8'))
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => resolve(found))
      zip.readEntry()
    })
  })
}

describe('the report', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'echoes-report-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes the profile folder as ~, whatever its slashes and case, so a public issue names no Windows account', () => {
    const profile = String.raw`C:\Users\Some.One`
    expect(withoutProfile(String.raw`Server folder: C:\Users\Some.One\Aion\server`, profile)).toBe(String.raw`Server folder: ~\Aion\server`)
    // a log written as JSON doubles its backslashes; another tool writes forward slashes, in lower case
    expect(withoutProfile(String.raw`at c:/users/some.one/aion and C:\\Users\\Some.One\\x`, profile)).toBe(String.raw`at ~/aion and ~\\x`)
    // a dot is a dot: another account is left alone
    expect(withoutProfile(String.raw`C:\Users\SomeXOne\x`, profile)).toBe(String.raw`C:\Users\SomeXOne\x`)
  })

  it('is named by its date, in a form Windows takes as a file name', () => {
    expect(reportStamp(new Date(2026, 10, 7, 9, 5, 3))).toBe('2026-11-07_09-05-03')
  })

  it('says the versions, each server with its problem, and the character played', () => {
    const summary = reportSummary(context, new Date('2026-11-07T10:00:00Z'))
    expect(summary).toContain('Launcher: 0.3.0-beta.4')
    expect(summary).toContain('Server: v0.1.0-beta.2 (c979e97), API level 1')
    expect(summary).toContain('game: failed (start-crashed: NullPointerException)')
    expect(summary).toContain('Character: Nemesis, level 36 ASSASSIN, ASMODIANS, on Morheim')
  })

  it('opens an issue on the server repository in the person’s language, naming the file to attach', () => {
    const url = new URL(issueUrl(context, 'report-2026-11-07_10-00-00.zip'))
    expect(url.origin + url.pathname).toBe('https://github.com/FayneDre/aion-server-playerbots/issues/new')
    const body = url.searchParams.get('body')!
    expect(body).toContain('launcher 0.3.0-beta.4, serveur v0.1.0-beta.2 (c979e97)')
    expect(body).toContain('report-2026-11-07_10-00-00.zip')
  })

  it('keeps every bot note of a log, and nothing else', async () => {
    const log = join(root, 'server_console.log')
    await writeFile(log, 'a line\r\n[INFO] BOT NOTE #1 by Nemesis: stuck at the bridge\r\nanother\r\nBOT NOTE #2 by Nemesis: fine\r\n')
    expect(await botNotes(log)).toEqual(['[INFO] BOT NOTE #1 by Nemesis: stuck at the bridge', 'BOT NOTE #2 by Nemesis: fine'])
    expect(await botNotes(join(root, 'missing.log'))).toEqual([])
  })

  it('zips the summary, each server’s logs and the bot notes', async () => {
    const dirs = { chat: join(root, 'chat-server'), login: join(root, 'login-server'), game: join(root, 'game-server') }
    for (const dir of Object.values(dirs)) {
      await mkdir(join(dir, 'log'), { recursive: true })
    }
    await writeFile(join(dirs.game, 'log', 'server_console.log'), 'started\nBOT NOTE #1 by Nemesis: here\n')
    await writeFile(join(dirs.game, 'log', 'launcher-stderr.log'), 'Error: could not find java\n')
    await writeFile(join(dirs.chat, 'log', 'server_console.log'), 'chat up\n')
    const definition = (id: 'chat' | 'login' | 'game'): ServerLayout['servers']['game'] => ({ id, dir: dirs[id], javaArgs: [], mainClass: 'Main', port: 1 })
    const layout: ServerLayout = {
      root,
      servers: { chat: definition('chat'), login: definition('login'), game: definition('game') },
      loginClientPort: 2106,
      mysql: { host: 'localhost', port: 3306 }
    }
    const path = await createReport(layout, join(root, 'reports'), context, new Date(2026, 10, 7, 10, 0, 0))
    expect(path).toBe(join(root, 'reports', 'report-2026-11-07_10-00-00.zip'))
    const files = await entries(path)
    expect([...files.keys()].sort()).toEqual(['bot-notes.txt', 'chat/server_console.log', 'game/launcher-stderr.log', 'game/server_console.log', 'summary.txt'])
    expect(files.get('bot-notes.txt')).toBe('BOT NOTE #1 by Nemesis: here\r\n')
    expect(files.get('summary.txt')).toContain('Character: Nemesis')
  })
})

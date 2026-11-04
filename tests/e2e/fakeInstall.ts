import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => done(typeof address === 'object' && address ? address.port : 0))
    })
  })
}

// rates.properties and ranking.properties as the 4.8 server ships them.
const RATES: [string, string][] = [
  ['crafting.crit_chances', '15.0, 30.0'],
  ['crafting.combo_crit_chances', '25.0, 50.0'],
  ['manastone_chances', '75.0, 75.0'],
  ['enchantment_stone.base_chances', '65.0, 65.0'],
  ['enchantment_stone.amplified_chances', '61.0, 61.0'],
  ['tampering_chances', '65.0, 65.0'],
  ...['xp.solo', 'xp.group', 'xp.quest', 'xp.gathering', 'xp.crafting', 'xp.pvp', 'skill_xp.gathering', 'skill_xp.crafting'].map(
    (key): [string, string] => [key, '1.0, 2.0']
  ),
  ['ap.pvp.gain', '1.0, 2.0'],
  ['ap.pvp.loss', '1.0, 1.0'],
  ...['ap.pve', 'ap.quest', 'ap.dredgion', 'gp.gain', 'dp.pve', 'dp.pvp', 'kinah.quest', 'drop', 'gathering.count'].map(
    (key): [string, string] => [key, '1.0, 2.0']
  ),
  ...['pvparena.discipline', 'pvparena.chaos', 'pvparena.harmony', 'pvparena.glory', 'sell_limit'].map((key): [string, string] => [key, '1.0, 2.0'])
]
const GP_LOSS: [string, number][] = [
  ['STAR1_OFFICER', 9],
  ['STAR2_OFFICER', 19],
  ['STAR3_OFFICER', 31],
  ['STAR4_OFFICER', 51],
  ['STAR5_OFFICER', 150],
  ['GENERAL', 171],
  ['GREAT_GENERAL', 176],
  ['COMMANDER', 190],
  ['SUPREME_COMMANDER', 219]
]

function startBat(mainClass: string): string {
  return `@ECHO off\r\nTITLE test\r\n:START\r\nJAVA -Xms16m -Xmx16m -cp "libs/*" ${mainClass}\r\nPAUSE\r\n`
}

export interface FakeInstall {
  root: string
  serverRoot: string
  clientRoot: string
  userData: string
  ports: { chat: number; login: number; loginClient: number; game: number; mysql: number }
  dispose: () => Promise<void>
}

/**
 * A server installation and a client folder in a temporary directory, laid out like a real one, on free ports so a real server running
 * on the same machine is never touched. A plain TCP listener plays MySQL.
 */
export async function createFakeInstall(options: { mysqlUp?: boolean } = {}): Promise<FakeInstall> {
  const root = mkdtempSync(join(tmpdir(), 'echoes-install-'))
  const serverRoot = join(root, 'server')
  const clientRoot = join(root, 'Aion 4.8 NA')
  const ports = {
    chat: await freePort(),
    login: await freePort(),
    loginClient: await freePort(),
    game: await freePort(),
    mysql: await freePort()
  }

  const write = (path: string, text: string): void => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  write(join(serverRoot, 'chat-server', 'start.bat'), startBat('com.aionemu.chatserver.ChatServer'))
  write(
    join(serverRoot, 'chat-server', 'config', 'network', 'network.properties'),
    `chatserver.network.gameserver.socket_address = 0.0.0.0:${ports.chat}\n`
  )
  write(join(serverRoot, 'login-server', 'start.bat'), startBat('com.aionemu.loginserver.LoginServer'))
  write(
    join(serverRoot, 'login-server', 'config', 'network', 'network.properties'),
    `loginserver.network.client.socket_address = 0.0.0.0:${ports.loginClient}\n` +
      `loginserver.network.gameserver.socket_address = 0.0.0.0:${ports.login}\n`
  )
  write(join(serverRoot, 'game-server', 'start.bat'), startBat('com.aionemu.gameserver.GameServer'))
  write(
    join(serverRoot, 'game-server', 'config', 'network', 'network.properties'),
    `gameserver.network.client.socket_address = 0.0.0.0:${ports.game}\n` +
      `gameserver.network.login.address = localhost:${ports.login}\n` +
      `gameserver.network.chat.address = localhost:${ports.chat}\n`
  )
  write(
    join(serverRoot, 'game-server', 'config', 'network', 'database.properties'),
    `database.url = jdbc:mysql://127.0.0.1:${ports.mysql}/aion_gs?characterEncoding=UTF-8\n`
  )
  // The default files of the settings the launcher edits, with the server's own values.
  write(join(serverRoot, 'game-server', 'config', 'main', 'rates.properties'), RATES.map(([key, value]) => `gameserver.rates.${key} = ${value}\n`).join(''))
  write(
    join(serverRoot, 'game-server', 'config', 'main', 'ranking.properties'),
    GP_LOSS.map(([rank, points]) => `gameserver.topranking.gp_loss.${rank} = ${points}\n`).join('')
  )
  write(join(serverRoot, 'game-server', 'config', 'main', 'gameserver.properties'), 'gameserver.character.creation.mode = 0\n')
  write(join(serverRoot, 'game-server', 'config', 'mygs.properties'), '# local overrides\ndatabase.user = aion\n')
  write(join(clientRoot, 'bin64', 'aion.bin'), '')

  let mysql: Server | null = null
  if (options.mysqlUp ?? true) {
    mysql = createServer((socket) => socket.destroy())
    await new Promise<void>((done) => mysql!.listen(ports.mysql, '127.0.0.1', done))
  }

  return {
    root,
    serverRoot,
    clientRoot,
    userData: join(root, 'user-data'),
    ports,
    dispose: async () => {
      await new Promise<void>((done) => (mysql ? mysql.close(() => done()) : done()))
      // The fake servers may still be closing their files.
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          rmSync(root, { recursive: true, force: true })
          return
        } catch {
          await new Promise((wait) => setTimeout(wait, 300))
        }
      }
    }
  }
}

export async function launchWith(install: FakeInstall): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ECHOES_USER_DATA_DIR: install.userData,
      AION_SERVER_HOME: install.serverRoot,
      ECHOES_FAKE_JAVA: resolve('tests/fixtures/fake-java.mjs'),
      ECHOES_FAKE_CLIENT: resolve('tests/fixtures/fake-client.mjs')
    }
  })
  const page = await app.firstWindow()
  return { app, page }
}

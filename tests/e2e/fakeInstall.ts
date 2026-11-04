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
  // The default files of the settings the launcher edits, as the server ships them (cut down).
  write(
    join(serverRoot, 'game-server', 'config', 'main', 'rates.properties'),
    ['solo', 'group', 'quest', 'gathering', 'crafting', 'pvp'].map((source) => `gameserver.rates.xp.${source} = 1.0, 2.0\n`).join('') +
      'gameserver.rates.ap.pvp.gain = 1.0, 2.0\ngameserver.rates.ap.pvp.loss = 1.0, 1.0\ngameserver.rates.ap.pve = 1.0, 2.0\n' +
      'gameserver.rates.ap.quest = 1.0, 2.0\ngameserver.rates.ap.dredgion = 1.0, 2.0\ngameserver.rates.gp.gain = 1.0, 2.0\n'
  )
  write(
    join(serverRoot, 'game-server', 'config', 'main', 'ranking.properties'),
    'gameserver.topranking.gp_loss.STAR1_OFFICER = 9\ngameserver.topranking.gp_loss.SUPREME_COMMANDER = 219\n'
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

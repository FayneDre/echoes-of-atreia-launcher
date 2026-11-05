import { createHash } from 'node:crypto'
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

export interface FakeAccount {
  id: number
  name: string
  password: string
}

export interface FakeCharacter {
  id: number
  accountId: number
  name: string
  exp: number
  race: 'ELYOS' | 'ASMODIANS'
  gender: 'MALE' | 'FEMALE'
  playerClass: string
  worldId: number
  online: boolean
  deleting: boolean
}

/** Two accounts of one person, and a third the tests never sign in to. Experience 400 is level 2, 1500 level 3 in the fake table. */
export const FAKE_ACCOUNTS: FakeAccount[] = [
  { id: 1, name: 'player1', password: 'secret' },
  { id: 2, name: 'player2', password: 'other' },
  { id: 3, name: 'stranger', password: 'x' }
]

export const FAKE_CHARACTERS: FakeCharacter[] = [
  { id: 101, accountId: 1, name: 'Aeris', exp: 1500, race: 'ELYOS', gender: 'FEMALE', playerClass: 'CLERIC', worldId: 110010000, online: true, deleting: false },
  { id: 102, accountId: 1, name: 'Borin', exp: 400, race: 'ASMODIANS', gender: 'MALE', playerClass: 'GLADIATOR', worldId: 220010000, online: false, deleting: false },
  { id: 201, accountId: 2, name: 'Cyra', exp: 0, race: 'ELYOS', gender: 'FEMALE', playerClass: 'BARD', worldId: 999, online: false, deleting: true },
  { id: 301, accountId: 3, name: 'Nobody', exp: 0, race: 'ELYOS', gender: 'MALE', playerClass: 'MAGE', worldId: 110010000, online: false, deleting: false }
]

export const FAKE_BOTS = [
  { id: 900001, name: 'Zephyra', exp: 1500, race: 'ELYOS', playerClass: 'CLERIC', worldId: 110010000, inWorld: true },
  { id: 900002, name: 'Aldric', exp: 400, race: 'ELYOS', playerClass: 'GLADIATOR', worldId: 110010000, inWorld: false },
  { id: 900003, name: 'Brakka', exp: 1500, race: 'ASMODIANS', playerClass: 'GLADIATOR', worldId: 220010000, inWorld: true }
]

/** Writes the stand-in for the two databases the launcher reads (ECHOES_FAKE_DB), passwords hashed as the login server hashes them. */
export function writeFakeDatabase(install: FakeInstall, accounts: FakeAccount[] = FAKE_ACCOUNTS, characters = FAKE_CHARACTERS, bots = FAKE_BOTS): void {
  const hash = (password: string): string => createHash('sha1').update(password, 'utf8').digest('base64')
  writeFileSync(
    install.database,
    JSON.stringify({
      accounts: accounts.map((account) => ({ id: account.id, name: account.name, passwordHash: hash(account.password) })),
      characters,
      bots
    })
  )
}

export interface FakeInstall {
  root: string
  serverRoot: string
  clientRoot: string
  userData: string
  /** The file that stands in for the account and character databases. */
  database: string
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
    `database.url = jdbc:mysql://127.0.0.1:${ports.mysql}/aion_gs?characterEncoding=UTF-8\ndatabase.user = root\n`
  )
  write(
    join(serverRoot, 'login-server', 'config', 'network', 'database.properties'),
    `database.url = jdbc:mysql://127.0.0.1:${ports.mysql}/aion_ls?characterEncoding=UTF-8\ndatabase.user = aion\n` +
      'database.password = p"a\\ss #word\n'
  )
  // The two databases the fake mysqldump and mysql read and write.
  write(join(root, 'mysql-data', 'aion_ls.sql'), 'accounts v1\n')
  write(join(root, 'mysql-data', 'aion_gs.sql'), 'characters v1\n')
  // The default files of the settings the launcher edits, with the server's own values.
  write(join(serverRoot, 'game-server', 'config', 'main', 'rates.properties'), RATES.map(([key, value]) => `gameserver.rates.${key} = ${value}\n`).join(''))
  write(
    join(serverRoot, 'game-server', 'config', 'main', 'ranking.properties'),
    GP_LOSS.map(([rank, points]) => `gameserver.topranking.gp_loss.${rank} = ${points}\n`).join('')
  )
  write(join(serverRoot, 'game-server', 'config', 'main', 'gameserver.properties'), 'gameserver.character.creation.mode = 0\n')
  // The bot options, as the server's playerbot.properties ships them.
  write(
    join(serverRoot, 'game-server', 'config', 'main', 'playerbot.properties'),
    [
      'gameserver.playerbot.xp.solo = 1',
      'gameserver.playerbot.xp.group = 1',
      'gameserver.playerbot.xp.pvp = 100',
      'gameserver.playerbot.pvp.enable = true',
      'gameserver.playerbot.pvp.share.fighter = 25',
      'gameserver.playerbot.pvp.share.opportunist = 25',
      'gameserver.playerbot.pvp.share.peaceful = 50',
      'gameserver.playerbot.pvp.level_above = 3',
      'gameserver.playerbot.pvp.level_below = 6',
      'gameserver.playerbot.chat.enable = true',
      'gameserver.playerbot.chat.language = FR',
      'gameserver.playerbot.broker.enable = true',
      'gameserver.playerbot.broker.size = 6000',
      'gameserver.playerbot.broker.buyer.enable = true',
      'gameserver.playerbot.broker.buyer.tolerance = 5',
      'gameserver.playerbot.broker.buyer.daily_kinah = 200000000',
      ''
    ].join('\n')
  )
  write(join(serverRoot, 'game-server', 'config', 'mygs.properties'), '# local overrides\ndatabase.user = aion\n')
  // What the launcher reads the levels and the map names from.
  write(
    join(serverRoot, 'game-server', 'data', 'static_data', 'player_experience_table.xml'),
    '<player_experience_table><exp>0</exp><exp>400</exp><exp>1433</exp><exp>3820</exp><exp>9054</exp></player_experience_table>\n'
  )
  write(
    join(serverRoot, 'game-server', 'data', 'static_data', 'world_maps.xml'),
    '<world_maps>\n\t<map id="110010000" cName="LC1" name="Sanctum"/>\n\t<map id="220010000" cName="DF1" name="Ishalgen"/>\n</world_maps>\n'
  )
  write(join(clientRoot, 'bin64', 'aion.bin'), '')

  let mysql: Server | null = null
  if (options.mysqlUp ?? true) {
    mysql = createServer((socket) => socket.destroy())
    await new Promise<void>((done) => mysql!.listen(ports.mysql, '127.0.0.1', done))
  }

  const install: FakeInstall = {
    root,
    serverRoot,
    clientRoot,
    userData: join(root, 'user-data'),
    database: join(root, 'database.json'),
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
  writeFakeDatabase(install)
  return install
}

export async function launchWith(install: FakeInstall): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ECHOES_USER_DATA_DIR: install.userData,
      AION_SERVER_HOME: install.serverRoot,
      ECHOES_FAKE_JAVA: resolve('tests/fixtures/fake-java.mjs'),
      ECHOES_FAKE_CLIENT: resolve('tests/fixtures/fake-client.mjs'),
      ECHOES_FAKE_DB: install.database,
      ECHOES_FAKE_MYSQL_TOOLS: resolve('tests/fixtures/mysql-tools'),
      ECHOES_FAKE_MYSQL_DATA: join(install.root, 'mysql-data')
    }
  })
  const page = await app.firstWindow()
  return { app, page }
}

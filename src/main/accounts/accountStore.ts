import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createConnection, type RowDataPacket } from 'mysql2/promise'
import type { ServerLayout } from '../server/installation'
import { readServerConfig } from '../server/properties'

export interface AccountRecord {
  id: number
  name: string
  /** As the login server keeps it: SHA-1 of the UTF-8 password, in Base64. */
  passwordHash: string
}

export interface CharacterRecord {
  id: number
  name: string
  exp: number
  race: 'ELYOS' | 'ASMODIANS'
  gender: 'MALE' | 'FEMALE'
  playerClass: string
  worldId: number
  online: boolean
  deleting: boolean
}

/** A bot: a character the server plays itself, from the `playerbot_characters` table. */
export interface BotRecord {
  id: number
  name: string
  exp: number
  race: 'ELYOS' | 'ASMODIANS'
  playerClass: string
  worldId: number
  /** In the world as the server last knew it: while the game server runs, those that are present. */
  inWorld: boolean
}

/** Where the launcher reads accounts and characters: the server's two databases, or, in the end-to-end tests, a file standing in for them. */
export interface AccountStore {
  findAccount(name: string): Promise<AccountRecord | null>
  listCharacters(accountId: number): Promise<CharacterRecord[]>
  listBots(): Promise<BotRecord[]>
}

/** The login server's password hash (`AccountUtils.encodePassword`), so a password is checked exactly as the server checks it. */
export function passwordHash(password: string): string {
  return createHash('sha1').update(password, 'utf8').digest('base64')
}

export interface DatabaseAddress {
  host: string
  port: number
  database: string
  user: string
  password: string
}

/** Host, port and database of a `jdbc:mysql://host:port/database?...` URL. */
export function databaseOf(url: string | undefined): { host: string; port: number; database: string } | null {
  const match = url?.match(/^jdbc:(?:mysql|mariadb):\/\/([^:/?]+)(?::(\d+))?\/([^?]+)/)
  if (!match) {
    return null
  }
  return { host: match[1]!, port: match[2] ? Number(match[2]) : 3306, database: match[3]! }
}

/** The database a server uses and its credentials, from its `config` (overrides included). */
export async function addressOf(serverDir: string): Promise<DatabaseAddress | null> {
  const config = await readServerConfig(serverDir)
  const location = databaseOf(config.get('database.url'))
  if (!location) {
    return null
  }
  return { ...location, user: config.get('database.user') ?? 'root', password: config.get('database.password') ?? '' }
}

/** A connection is opened for each question and closed after it: the launcher asks rarely, and must hold nothing while the servers run. */
async function query<T extends RowDataPacket>(address: DatabaseAddress, sql: string, values: unknown[]): Promise<T[]> {
  const connection = await createConnection({ ...address, connectTimeout: 4000, charset: 'utf8mb4' })
  try {
    const [rows] = await connection.query<T[]>(sql, values)
    return rows
  } finally {
    await connection.end()
  }
}

/**
 * The server's own databases, with the credentials each server uses (from its `config`, overrides included): the login server's for the
 * accounts, the game server's for the characters. Read only.
 */
export class MysqlAccountStore implements AccountStore {
  constructor(private readonly layout: ServerLayout) {}

  async findAccount(name: string): Promise<AccountRecord | null> {
    const address = await addressOf(this.layout.servers.login.dir)
    if (!address) {
      throw new Error('The login server has no database.url')
    }
    const rows = await query<RowDataPacket>(address, 'SELECT `id`, `name`, `password` FROM `account_data` WHERE `name` = ? LIMIT 1', [name])
    const row = rows[0]
    return row ? { id: Number(row['id']), name: String(row['name']), passwordHash: String(row['password']) } : null
  }

  async listCharacters(accountId: number): Promise<CharacterRecord[]> {
    const address = await addressOf(this.layout.servers.game.dir)
    if (!address) {
      throw new Error('The game server has no database.url')
    }
    const rows = await query<RowDataPacket>(
      address,
      'SELECT `id`, `name`, `exp`, `race`, `gender`, `player_class`, `world_id`, `online`, `deletion_date` FROM `players` ' +
        'WHERE `account_id` = ? ORDER BY `last_online` DESC, `name`',
      [accountId]
    )
    return rows.map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      exp: Number(row['exp']),
      race: row['race'] as CharacterRecord['race'],
      gender: row['gender'] as CharacterRecord['gender'],
      playerClass: String(row['player_class']),
      worldId: Number(row['world_id']),
      online: Boolean(row['online']),
      deleting: row['deletion_date'] !== null
    }))
  }

  async listBots(): Promise<BotRecord[]> {
    const address = await addressOf(this.layout.servers.game.dir)
    if (!address) {
      throw new Error('The game server has no database.url')
    }
    const rows = await query<RowDataPacket>(
      address,
      'SELECT p.`id`, p.`name`, p.`exp`, p.`race`, p.`player_class`, p.`world_id`, b.`in_world` ' +
        'FROM `playerbot_characters` b JOIN `players` p ON p.`id` = b.`player_id` ORDER BY p.`name`',
      []
    )
    return rows.map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      exp: Number(row['exp']),
      race: row['race'] as BotRecord['race'],
      playerClass: String(row['player_class']),
      worldId: Number(row['world_id']),
      inWorld: Boolean(row['in_world'])
    }))
  }
}

/** The end-to-end tests' stand-in for the databases (ECHOES_FAKE_DB): a JSON file of accounts and characters, read at every question. */
export class FileAccountStore implements AccountStore {
  constructor(private readonly file: string) {}

  private async read(): Promise<{ accounts: AccountRecord[]; characters: (CharacterRecord & { accountId: number })[]; bots?: BotRecord[] }> {
    return JSON.parse(await readFile(this.file, 'utf8'))
  }

  async findAccount(name: string): Promise<AccountRecord | null> {
    return (await this.read()).accounts.find((account) => account.name === name) ?? null
  }

  async listCharacters(accountId: number): Promise<CharacterRecord[]> {
    return (await this.read()).characters.filter((character) => character.accountId === accountId)
  }

  async listBots(): Promise<BotRecord[]> {
    return (await this.read()).bots ?? []
  }
}

export function accountStoreFor(layout: ServerLayout): AccountStore {
  const fake = process.env['ECHOES_FAKE_DB']
  return fake ? new FileAccountStore(fake) : new MysqlAccountStore(layout)
}

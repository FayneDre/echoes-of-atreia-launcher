// What the main process tells the interface. Plain data only: it crosses the IPC bridge.

export const SERVER_IDS = ['chat', 'login', 'game'] as const
export type ServerId = (typeof SERVER_IDS)[number]

/** `registering` is the game server only: its port is open but it has not reached the login server yet, so no client can connect. */
export type ServerStatus = 'stopped' | 'starting' | 'registering' | 'ready' | 'stopping' | 'failed'

export type MysqlStatus = 'unknown' | 'missing' | 'stopped' | 'starting' | 'ready' | 'stopping'

export type ProblemCode =
  | 'server-missing'
  | 'client-missing'
  | 'java-missing'
  | 'java-too-old'
  | 'mysql-missing'
  | 'mysql-refused'
  | 'mysql-timeout'
  | 'mysql-in-use'
  | 'exited'
  | 'port-timeout'
  | 'register-timeout'
  | 'stop-unanswered'
  | 'stop-timeout'
  | 'client-failed'
  | 'account-unknown'
  | 'password-wrong'
  | 'password-needed'
  | 'database-unreachable'
  | 'encryption-unavailable'
  | 'mysql-tools-missing'
  | 'backup-failed'
  | 'restore-failed'
  | 'servers-running'
  | 'launcher-busy'
  | 'game-not-ready'
  | 'no-character'
  | 'not-in-game'
  | 'admin-failed'

/** A code the interface translates, and what the system said, shown as is. */
export interface Problem {
  code: ProblemCode
  detail?: string
}

export interface ServerState {
  id: ServerId
  status: ServerStatus
  /** Started outside the launcher (a script, a start.bat): the launcher found it running and can still stop it. */
  external: boolean
  port: number | null
  problem?: Problem
}

export interface MysqlState {
  status: MysqlStatus
  /** The Windows service the launcher can start and stop, when there is one. */
  serviceName: string | null
  port: number | null
  problem?: Problem
}

export interface InstallState {
  serverRoot: string | null
  serverFound: boolean
  clientRoot: string | null
  clientFound: boolean
  /** Major version of the Java the servers would run on; null when there is none. */
  javaVersion: number | null
}

/**
 * What the launcher is doing. A stop may interrupt a start (the game server takes minutes to load), so the two are told apart; anything
 * else waits for `idle`.
 */
export type Activity = 'detecting' | 'idle' | 'starting' | 'stopping' | 'mysql' | 'backup' | 'restore'

export interface LauncherState {
  install: InstallState
  mysql: MysqlState
  servers: Record<ServerId, ServerState>
  activity: Activity
  /** The window was closed while servers run: the interface asks what to do with them. */
  quitRequested: boolean
  /** Settings were saved while the game server ran: they apply at its next start. */
  restartNeeded: boolean
  /** Why the last start of the stack could not begin (no server folder, no Java...). */
  problem?: Problem
}

export type { ServerSettings } from './settingsCatalog'

/** A character of the signed-in account, as the game database has it. */
export interface CharacterSummary {
  id: number
  name: string
  level: number
  /** The server's class name, such as GLADIATOR; the interface translates it. */
  playerClass: string
  race: 'ELYOS' | 'ASMODIANS'
  gender: 'MALE' | 'FEMALE'
  /** The name of the map it stands on, from the server's world data; null for one it does not name. */
  mapName: string | null
  online: boolean
  /** Set when the character is waiting to be deleted. */
  deleting: boolean
}

/** A copy of the server's databases, in a folder of its own under the server's `backups`. */
export interface BackupSummary {
  /** The folder's name, which is its date: `2026-11-04_21-30-05`. */
  id: string
  createdAt: string
  /** Made by the person, or by the launcher just before a restore replaced what was there. */
  kind: 'manual' | 'before-restore'
  databases: { name: string; bytes: number }[]
}

/** The accounts the launcher keeps, and the one in use with its characters. */
export interface AccountsState {
  /** The accounts saved on this computer, by name, their passwords kept encrypted. */
  accounts: string[]
  active: string | null
  /** The active account's characters; empty when they could not be read, the problem then says why. */
  characters: CharacterSummary[]
  /** The character the person plays with, on the active account. */
  selectedCharacterId: number | null
  problem?: Problem
}

export interface LogBatch {
  server: ServerId
  lines: string[]
}

export type FolderKind = 'server' | 'client'

export type QuitAnswer = 'stop' | 'leave' | 'cancel'

export const REQUIRED_JAVA = 25

/** A place the game server can send a character to, as it names it. */
export interface DestinationSummary {
  id: number
  name: string
}

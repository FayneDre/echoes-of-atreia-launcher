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
  | 'mysql-service-stopped'
  | 'mysql-options-missing'
  | 'mysql-program-missing'
  | 'mysql-program-exited'
  | 'mysql-shutdown-failed'
  | 'exited'
  | 'start-crashed'
  | 'port-timeout'
  | 'register-timeout'
  | 'stop-unanswered'
  | 'stop-timeout'
  | 'stop-unknown-process'
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
  | 'update-feed-failed'
  | 'update-download-failed'
  | 'update-corrupt'
  | 'update-jdk-missing'
  | 'update-stop-failed'
  | 'update-files-failed'
  | 'update-sql-failed'
  | 'update-nothing-to-return'

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
  /** The person's own option file (my.ini) when MySQL runs as a program with it rather than through its service. */
  optionsFile: string | null
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
export type Activity = 'detecting' | 'idle' | 'starting' | 'stopping' | 'mysql' | 'backup' | 'restore' | 'server-update'

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
  /** What the game server says it is, or null while that is not known (stopped, and no manifest.json in its install). */
  serverVersion: ServerVersion | null
}

/**
 * The lowest launcher API level a game server must have for this launcher (the server's `AdminChannel.API_LEVEL`), and the first server
 * version that has it, named to the person. Raised with a release that needs a newer server, and said in its notes.
 */
export const MIN_SERVER_API_LEVEL = 1
export const MIN_SERVER_VERSION = 'v0.1.0-beta.1'

export interface ServerVersion {
  /** Where it was read: the running game server's answer, or the install's `manifest.json` while it is stopped. */
  from: 'server' | 'manifest'
  /** A release such as v0.1.0-beta.1, `dev` for a build that was not made as one, null when the server did not say. */
  version: string | null
  revision: string | null
  /** 0 for a server that does not know the `version` request: older than the levels. */
  apiLevel: number
}

/** A server known to be older than this launcher needs. An unknown one is not: nothing is said rather than something wrong. */
export function isServerTooOld(version: ServerVersion | null): boolean {
  return version !== null && version.apiLevel < MIN_SERVER_API_LEVEL
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

/** One of the server's bots. */
export interface BotSummary {
  id: number
  name: string
  level: number
  /** The server's class name, such as GLADIATOR; the interface translates it. */
  playerClass: string
  race: 'ELYOS' | 'ASMODIANS'
  mapName: string | null
  /** In the world as the server last knew it. */
  inWorld: boolean
}

/**
 * The launcher's own update. `off`: a run that cannot update itself (not installed, such as a development run). `portable`: the portable
 * build, which cannot replace itself, so a newer version is only pointed to. `ready`: downloaded, installed when the launcher closes.
 */
export type UpdateStatus = 'off' | 'idle' | 'downloading' | 'ready' | 'portable'

export interface UpdateState {
  status: UpdateStatus
  /** The newer version, once one is found. */
  version?: string
  /** Of the download, 0 to 100. */
  percent?: number
  /** The release's notes in each language, as written (Markdown), when they could be fetched. */
  notes?: Partial<Record<'en' | 'fr', string>>
  /** The release's page, for the portable build. */
  releaseUrl?: string
}

/** A launcher whose version carries a pre-release part follows the pre-releases; a stable one only the releases. */
export function isBetaVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+-/.test(version)
}

/**
 * Orders two versions as semantic versioning does, with or without their leading v: a beta sorts before the release it leads to. Null when
 * either is not a version of the form X.Y.Z or X.Y.Z-beta.N (`dev`, for one).
 */
export function compareVersions(a: string, b: string): number | null {
  const parse = (text: string): number[] | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(text)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? Infinity : Number(match[4])] : null
  }
  const left = parse(a)
  const right = parse(b)
  if (!left || !right) {
    return null
  }
  for (let index = 0; index < 4; index++) {
    if (left[index]! !== right[index]!) {
      return left[index]! < right[index]! ? -1 : 1
    }
  }
  return 0
}

/**
 * Where the server update stands. `off`: nothing to look at (no server folder, or the releases could not be read). `dev`: an install made by
 * the server's deploy script, never overwritten by a release. `current`: the newest release is installed. `available`: a newer one exists.
 * `preparing`: it is downloaded and checked, no server touched yet. `confirm`: ready to install, waiting for the person. `installing`: the
 * servers are stopped and the files changing. `failed`: the last step went wrong, `problem` says which.
 */
export type ServerUpdateStatus = 'off' | 'dev' | 'current' | 'available' | 'preparing' | 'confirm' | 'installing' | 'failed'

export type ServerUpdateStep = 'download' | 'navmesh' | 'verify' | 'stop' | 'files' | 'sql' | 'start' | 'return'

export interface ServerUpdateState {
  status: ServerUpdateStatus
  /** The release installed, null for a server with no manifest (built from git); `dev` for a development install. */
  installed: string | null
  /** The revision of a development install, shown instead of an update. */
  revision?: string | null
  /** The newer release, with its notes in each language when they could be fetched. */
  available?: { version: string; notes?: Partial<Record<'en' | 'fr', string>> }
  step?: ServerUpdateStep
  /** Of the step, 0 to 100, when it can be told. */
  percent?: number
  /** Default files edited by hand: each is left as it is, the release's own put beside it as `<file>.new-<version>`. */
  keptLocal?: string[]
  /** The database has never been through the server's SQL script: its statements are recorded as applied, not run. */
  markApplied?: boolean
  /** The JDK the release needs (the game server compiles its handlers at every start), and whether this computer has it. */
  jdk?: { needed: number; found: number | null; ok: boolean }
  /** The version the last update can be undone to (null: a server built from git), when its backup is there. */
  canReturnTo?: { version: string | null }
  problem?: Problem
}

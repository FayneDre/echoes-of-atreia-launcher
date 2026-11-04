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
export type Activity = 'detecting' | 'idle' | 'starting' | 'stopping' | 'mysql'

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

/**
 * The server settings the launcher shows. Rates are multipliers of the server's defaults (1 is the official rate): applied to every
 * membership level at once, so a premium account keeps its edge.
 */
export interface ServerSettings {
  xpRate: number
  apRate: number
  gpRate: number
  /** Share of the daily Glory Point loss each Abyss rank keeps, in percent: 100 is the official loss, 0 turns it off. */
  gpDailyLossPercent: number
  /** Characters of both factions on one account. */
  bothFactions: boolean
}

export const SETTING_LIMITS = {
  rate: { min: 0.1, max: 100 },
  gpDailyLossPercent: { min: 0, max: 100 }
} as const

export interface LogBatch {
  server: ServerId
  lines: string[]
}

export type FolderKind = 'server' | 'client'

export type QuitAnswer = 'stop' | 'leave' | 'cancel'

export const REQUIRED_JAVA = 25

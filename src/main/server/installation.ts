import { readdir, readFile, stat } from 'node:fs/promises'
import { totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import type { ServerId } from '../../shared/types'
import { mysqlAddressOf, portOf, readServerConfig } from './properties'
import { fitHeapToMachine, javaArgumentsFrom } from './startScript'

export interface ServerDefinition {
  id: ServerId
  dir: string
  javaArgs: string[]
  mainClass: string
  /** The port the next server in line connects to (chat and login), or the one clients connect to (game). */
  port: number
}

export interface ServerLayout {
  root: string
  servers: Record<ServerId, ServerDefinition>
  /** The login server's port for game clients, which the client is started with. */
  loginClientPort: number
  mysql: { host: string; port: number }
}

const FOLDERS: Record<ServerId, string> = { chat: 'chat-server', login: 'login-server', game: 'game-server' }

// The setting each port comes from, and the server's own default when the setting is missing.
const PORT_SETTINGS: Record<ServerId, { key: string; fallback: number }> = {
  chat: { key: 'chatserver.network.gameserver.socket_address', fallback: 9021 },
  login: { key: 'loginserver.network.gameserver.socket_address', fallback: 9014 },
  game: { key: 'gameserver.network.client.socket_address', fallback: 7777 }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readDefinition(root: string, id: ServerId): Promise<{ definition: ServerDefinition; config: Map<string, string> } | null> {
  const dir = join(root, FOLDERS[id])
  let script: string
  try {
    script = await readFile(join(dir, 'start.bat'), 'utf8')
  } catch {
    return null
  }
  const scriptArgs = javaArgumentsFrom(script)
  const mainClass = scriptArgs?.at(-1)
  if (!scriptArgs || !mainClass) {
    return null
  }
  // only the game server's heap grows with the bots; the login and chat servers keep theirs
  const javaArgs = id === 'game' ? fitHeapToMachine(scriptArgs, totalmem()) : scriptArgs
  const config = await readServerConfig(dir)
  const port = portOf(config.get(PORT_SETTINGS[id].key)) ?? PORT_SETTINGS[id].fallback
  return { definition: { id, dir, javaArgs, mainClass, port }, config }
}

/** What the launcher needs to run the servers of an installation, or null when the folder is not one (a start.bat is missing). */
export async function readServerLayout(root: string): Promise<ServerLayout | null> {
  const [chat, login, game] = await Promise.all([readDefinition(root, 'chat'), readDefinition(root, 'login'), readDefinition(root, 'game')])
  if (!chat || !login || !game) {
    return null
  }
  return {
    root,
    servers: { chat: chat.definition, login: login.definition, game: game.definition },
    loginClientPort: portOf(login.config.get('loginserver.network.client.socket_address')) ?? 2106,
    mysql: mysqlAddressOf(game.config.get('database.url')) ?? { host: 'localhost', port: 3306 }
  }
}

export function clientExecutable(clientRoot: string): string {
  return join(clientRoot, 'bin64', 'aion.bin')
}

export function isClientFolder(folder: string): Promise<boolean> {
  return exists(clientExecutable(folder))
}

/** A client folder next to the server's, as a repack lays them out: a sibling of the server folder holding bin64/aion.bin. */
export async function findClientNear(serverRoot: string): Promise<string | null> {
  const parent = dirname(serverRoot)
  let entries
  try {
    entries = await readdir(parent, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const candidate = join(parent, entry.name)
    if (entry.isDirectory() && (await isClientFolder(candidate))) {
      return candidate
    }
  }
  return null
}

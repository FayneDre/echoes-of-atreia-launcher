import type { BotSummary, Problem } from '../../shared/types'
import { accountStoreFor } from '../accounts/accountStore'
import { loadGameData } from '../accounts/gameData'
import type { ServerLayout } from '../server/installation'

/** The server's bots, read from its database, with the level and the map named as the game does. Read only. */
export async function listBots(layout: ServerLayout | null): Promise<BotSummary[] | Problem> {
  if (!layout) {
    return { code: 'server-missing' }
  }
  try {
    const [records, data] = await Promise.all([accountStoreFor(layout).listBots(), loadGameData(layout.servers.game.dir)])
    return records.map((record) => ({
      id: record.id,
      name: record.name,
      level: data.levelFor(record.exp),
      playerClass: record.playerClass,
      race: record.race,
      mapName: data.mapName(record.worldId),
      resident: record.resident,
      inWorld: record.inWorld
    }))
  } catch (error) {
    // The bot tables exist once the game server has started with the bot module: before that, there is nothing to list.
    return { code: 'database-unreachable', detail: (error as Error).message }
  }
}

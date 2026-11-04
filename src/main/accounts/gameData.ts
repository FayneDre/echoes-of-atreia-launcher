import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** What the game database leaves to the server's data files: the level an amount of experience means, and the names of the maps. */
export interface GameData {
  levelFor: (exp: number) => number
  mapName: (worldId: number) => string | null
}

/**
 * The level for an amount of experience, the way the server reckons it (`PlayerExperienceTable.getLevelForExp`): the highest level whose
 * threshold the experience reaches, capped one under the table's length.
 */
export function levelForExp(thresholds: number[], exp: number): number {
  let level = 0
  for (let index = thresholds.length; index > 0; index--) {
    if (exp >= thresholds[index - 1]!) {
      level = index
      break
    }
  }
  return thresholds.length <= level ? thresholds.length - 1 : level
}

export function parseExperienceTable(xml: string): number[] {
  return [...xml.matchAll(/<exp>(\d+)<\/exp>/g)].map((match) => Number(match[1]))
}

export function parseMapNames(xml: string): Map<number, string> {
  const names = new Map<number, string>()
  for (const match of xml.matchAll(/<map\s[^>]*>/g)) {
    const id = match[0].match(/\bid="(\d+)"/)
    const name = match[0].match(/\bname="([^"]*)"/)
    if (id && name) {
      names.set(Number(id[1]), name[1]!)
    }
  }
  return names
}

async function readOrEmpty(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return ''
  }
}

/** Reads the game server's experience table and map list. A server without them still lists its characters, at level 0 and with no map. */
export async function loadGameData(gameDir: string): Promise<GameData> {
  const dataDir = join(gameDir, 'data', 'static_data')
  const thresholds = parseExperienceTable(await readOrEmpty(join(dataDir, 'player_experience_table.xml')))
  const maps = parseMapNames(await readOrEmpty(join(dataDir, 'world_maps.xml')))
  return {
    levelFor: (exp) => (thresholds.length ? levelForExp(thresholds, exp) : 0),
    mapName: (worldId) => maps.get(worldId) ?? null
  }
}

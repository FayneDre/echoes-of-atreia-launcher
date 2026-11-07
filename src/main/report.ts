import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, readFile, stat } from 'node:fs/promises'
import { release, totalmem } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import yazl from 'yazl'
import { SERVER_IDS, type CharacterSummary, type LauncherState, type ServerUpdateState } from '../shared/types'
import type { ServerLayout } from './server/installation'
import { SERVER_REPOSITORY } from './serverUpdate/feed'

/** Of each console log, the end only: a log rolls over at 100 MB, and what led to a problem is in its last minutes. */
const LOG_TAIL_BYTES = 8 * 1024 * 1024
/** The line a `//bot note` writes in the game server's console log. */
const BOT_NOTE = 'BOT NOTE'

export interface ReportContext {
  launcherVersion: string
  state: LauncherState
  serverUpdate: ServerUpdateState | null
  character: CharacterSummary | null
  botsInWorld: { elyos: number; asmodians: number } | null
  language: 'fr' | 'en'
}

/** `2026-11-07_14-03-22`: sorts by date, and holds no character Windows refuses in a file name. */
export function reportStamp(date: Date): string {
  const two = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`
}

/** What the report says in its first file, for whoever reads it: versions, the stack's state, the character played. */
export function reportSummary(context: ReportContext, now: Date): string {
  const { state, character } = context
  const version = state.serverVersion
  const lines = [
    `Echoes of Atreia problem report, ${now.toISOString()}`,
    '',
    `Launcher: ${context.launcherVersion}${state.developerMode ? ' (developer mode)' : ''}`,
    `Server: ${version ? `${version.version ?? 'unknown'}${version.revision ? ` (${version.revision})` : ''}, API level ${version.apiLevel}` : 'unknown'}`,
    `Server update: ${context.serverUpdate?.status ?? 'unknown'}${context.serverUpdate?.installed ? `, installed ${context.serverUpdate.installed}` : ''}`,
    `Windows: ${release()}, ${Math.round(totalmem() / 1024 ** 3)} GB of memory`,
    `Java: ${state.install.javaVersion ?? 'not found'}`,
    `Server folder: ${state.install.serverRoot ?? 'none'}${state.install.serverFound ? '' : ' (not found)'}`,
    `Client folder: ${state.install.clientRoot ?? 'none'}${state.install.clientFound ? '' : ' (not found)'}`,
    '',
    `Activity: ${state.activity}`,
    `MySQL: ${state.mysql.status}${state.mysql.problem ? ` (${state.mysql.problem.code})` : ''}`,
    ...SERVER_IDS.map((id) => {
      const server = state.servers[id]
      return `${id}: ${server.status}${server.external ? ', started outside the launcher' : ''}${server.problem ? ` (${server.problem.code}${server.problem.detail ? `: ${server.problem.detail}` : ''})` : ''}`
    }),
    ...(state.problem ? [`Last problem: ${state.problem.code}${state.problem.detail ? `: ${state.problem.detail}` : ''}`] : []),
    `Bots in the world: ${context.botsInWorld ? `${context.botsInWorld.elyos} Elyos, ${context.botsInWorld.asmodians} Asmodians` : 'unknown'}`,
    '',
    `Character: ${character ? `${character.name}, level ${character.level} ${character.playerClass}, ${character.race}, on ${character.mapName ?? 'an unnamed map'}` : 'none chosen'}`
  ]
  return `${lines.join('\r\n')}\r\n`
}

/** The page of a new issue on the server's repository, its text filled with the versions and the report's name, to attach by hand. */
export function issueUrl(context: ReportContext, fileName: string): string {
  const version = context.state.serverVersion
  const server = version ? `${version.version ?? '?'}${version.revision ? ` (${version.revision})` : ''}` : '?'
  const body =
    context.language === 'fr'
      ? [
          '**Ce qui s’est passé :**',
          '',
          '**Ce qui était attendu :**',
          '',
          `**Versions :** launcher ${context.launcherVersion}, serveur ${server}`,
          '',
          `Le rapport \`${fileName}\` est à glisser ici.`
        ]
      : [
          '**What happened:**',
          '',
          '**What was expected:**',
          '',
          `**Versions:** launcher ${context.launcherVersion}, server ${server}`,
          '',
          `Drop the report \`${fileName}\` here.`
        ]
  return `https://github.com/${SERVER_REPOSITORY}/issues/new?${new URLSearchParams({ body: body.join('\n') }).toString()}`
}

/** The end of a file, from the start of a line, or null when there is no such file. */
async function tail(path: string, bytes: number): Promise<Buffer | null> {
  let size: number
  try {
    size = (await stat(path)).size
  } catch {
    return null
  }
  if (size <= bytes) {
    return readFile(path)
  }
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    await handle.read(buffer, 0, bytes, size - bytes)
    const newline = buffer.indexOf(0x0a)
    return newline >= 0 ? buffer.subarray(newline + 1) : buffer
  } finally {
    await handle.close()
  }
}

/** Every `//bot note` line of a log, read line by line: the whole file is searched, at no more memory than a line. */
export async function botNotes(path: string): Promise<string[]> {
  const notes: string[] = []
  try {
    await stat(path)
  } catch {
    return notes
  }
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.includes(BOT_NOTE)) {
      notes.push(line)
    }
  }
  return notes
}

/**
 * Makes `report-<date>.zip` in `folder`: the summary, the end of each server's console log and what its JVM wrote before its logging started,
 * and the bot notes of the game server's current log. Returns its path.
 */
export async function createReport(layout: ServerLayout | null, folder: string, context: ReportContext, now = new Date()): Promise<string> {
  await mkdir(folder, { recursive: true })
  const path = join(folder, `report-${reportStamp(now)}.zip`)
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from(reportSummary(context, now), 'utf8'), 'summary.txt')
  if (layout) {
    for (const id of SERVER_IDS) {
      const logs = join(layout.servers[id].dir, 'log')
      for (const name of ['server_console.log', 'launcher-stderr.log']) {
        const content = await tail(join(logs, name), LOG_TAIL_BYTES)
        if (content) {
          zip.addBuffer(content, `${id}/${name}`)
        }
      }
    }
    const notes = await botNotes(join(layout.servers.game.dir, 'log', 'server_console.log'))
    zip.addBuffer(Buffer.from(notes.length ? `${notes.join('\r\n')}\r\n` : 'No bot note in this run of the game server.\r\n', 'utf8'), 'bot-notes.txt')
  }
  zip.end()
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(path)
    output.on('close', resolve)
    output.on('error', reject)
    zip.outputStream.on('error', reject)
    zip.outputStream.pipe(output)
  })
  return path
}

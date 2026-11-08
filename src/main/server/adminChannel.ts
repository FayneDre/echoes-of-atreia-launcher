import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { PopulationState } from '../../shared/types'

export type AdminAnswer = { ok: true; lines: string[] } | { ok: false; error: string }

const POLL_MS = 100

/**
 * Asks the running game server something, through the `admin` folder it watches: a request is a file `<id>.request`, written under another name
 * and renamed so the server never reads half of it, and the answer comes back as `<id>.response`, whose first line is `ok` or `error <why>`.
 * The server reads the folder twice a second; with no answer within `timeoutMs` (a server too old to have the channel, or one that is stuck)
 * the request is taken back and the answer is an error.
 */
export async function adminRequest(gameDir: string, command: string, timeoutMs = 5000): Promise<AdminAnswer> {
  const dir = join(gameDir, 'admin')
  const id = randomUUID()
  const request = join(dir, `${id}.request`)
  const response = join(dir, `${id}.response`)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${id}.tmp`), `${command}\n`, 'utf8')
    await rename(join(dir, `${id}.tmp`), request)
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      try {
        return parseAnswer(await readFile(response, 'utf8'))
      } catch {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      }
    }
    return { ok: false, error: 'no answer' }
  } finally {
    await rm(request, { force: true })
    await rm(response, { force: true })
    await rm(join(dir, `${id}.tmp`), { force: true })
  }
}

export function parseAnswer(text: string): AdminAnswer {
  const [first = '', ...rest] = text.split(/\r?\n/)
  if (first === 'ok') {
    return { ok: true, lines: rest.filter((line) => line.length > 0) }
  }
  return { ok: false, error: first.replace(/^error\s*/, '') || 'unknown error' }
}

/** The server's answer to `population`, one `key value` line each; null when the lines a launcher needs are missing. */
export function parsePopulation(lines: string[]): PopulationState | null {
  const values = new Map<string, string>()
  for (const line of lines) {
    const space = line.indexOf(' ')
    if (space > 0) {
      values.set(line.slice(0, space), line.slice(space + 1).trim())
    }
  }
  const count = (key: string): number | null => {
    const value = Number(values.get(key))
    return values.has(key) && Number.isInteger(value) && value >= 0 ? value : null
  }
  const mode = values.get('mode')
  const percent = count('percent')
  const [state = '', ...causes] = (values.get('guard') ?? '').split(/\s+/)
  if (!mode || percent === null || (state !== 'open' && state !== 'held' && state !== 'off')) {
    return null
  }
  const [awake, wanted, asleep, short] = ['awake', 'wanted', 'asleep', 'short'].map(count)
  return {
    mode,
    percent,
    totals: awake != null && wanted != null && asleep != null && short != null ? { awake, wanted, asleep, short } : null,
    guard: { state, causes: state === 'held' ? causes : [] },
    heapPercent: count('heap'),
    routeWaitSeconds: count('route-wait') ?? 0
  }
}

export interface Destination {
  id: number
  mapId: number
  x: number
  y: number
  z: number
  name: string
}

/** The server's answer to `destinations`: one tab-separated line each. Lines that are not well formed are left out. */
export function parseDestinations(lines: string[]): Destination[] {
  const found: Destination[] = []
  for (const line of lines) {
    const [id, mapId, x, y, z, ...name] = line.split('\t')
    const numbers = [id, mapId, x, y, z].map(Number)
    if (numbers.every(Number.isFinite) && name.join(' ').trim().length > 0) {
      found.push({ id: numbers[0]!, mapId: numbers[1]!, x: numbers[2]!, y: numbers[3]!, z: numbers[4]!, name: name.join(' ').trim() })
    }
  }
  return found
}

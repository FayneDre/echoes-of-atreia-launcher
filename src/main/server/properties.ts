import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

/**
 * Parses the text of a Java .properties file: `key = value` or `key: value` lines, `#` and `!` comments. Line continuations are not
 * supported; the server's files have none.
 */
export function parseProperties(text: string): Map<string, string> {
  const result = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('!')) {
      continue
    }
    const separator = line.search(/[=:]/)
    if (separator <= 0) {
      continue
    }
    result.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  return result
}

async function listPropertiesFiles(folder: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true, recursive: true })
  } catch {
    return []
  }
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.properties')).map((entry) => join(entry.parentPath, entry.name))
}

async function readInto(target: Map<string, string>, files: string[]): Promise<void> {
  for (const file of files) {
    // Java reads .properties files as ISO-8859-1.
    for (const [key, value] of parseProperties(await readFile(file, 'latin1'))) {
      target.set(key, value)
    }
  }
}

/**
 * A server's settings in its two layers: the default files of its `config` folder, and those values with the local overrides on top
 * (`mygs.properties` and its kind, a `my*.properties` at the root of `config`), which win, as the server merges them.
 */
export async function readConfigLayers(serverDir: string): Promise<{ defaults: Map<string, string>; merged: Map<string, string> }> {
  const configDir = join(serverDir, 'config')
  const files = await listPropertiesFiles(configDir)
  const isOverride = (file: string): boolean => dirname(file) === configDir && basename(file).startsWith('my')

  const defaults = new Map<string, string>()
  await readInto(defaults, files.filter((file) => !isOverride(file)).sort())
  const merged = new Map(defaults)
  await readInto(merged, files.filter(isOverride).sort())
  return { defaults, merged }
}

/** Every setting a server reads from its `config` folder, overrides included. */
export async function readServerConfig(serverDir: string): Promise<Map<string, string>> {
  return (await readConfigLayers(serverDir)).merged
}

/** The key of a `key = value` line, or null for a comment, a blank line or anything else. */
export function keyOfLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
    return null
  }
  const separator = trimmed.search(/[=:]/)
  return separator > 0 ? trimmed.slice(0, separator).trim() : null
}

/**
 * Applies changes to the text of a .properties file, keeping everything else as it was: comments, other settings, line endings. A value
 * replaces every line of its key; null removes them (the default applies again); a key the file does not have yet is added at the end.
 */
export function applyPropertyChanges(text: string, changes: Map<string, string | null>, header: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.length ? text.split(/\r?\n/) : []
  // A file that ends with a line break splits into a last empty string: it is put back by the join.
  const endsWithBreak = lines.length > 0 && lines.at(-1) === ''
  if (endsWithBreak) {
    lines.pop()
  }

  const written = new Set<string>()
  const kept: string[] = []
  for (const line of lines) {
    const key = keyOfLine(line)
    if (key === null || !changes.has(key)) {
      kept.push(line)
      continue
    }
    const value = changes.get(key)
    // A key set to null is dropped, and so is a second line of a key already written: the file keeps a single one.
    if (value !== null && value !== undefined && !written.has(key)) {
      kept.push(`${key} = ${value}`)
      written.add(key)
    }
  }

  const added = [...changes].filter(([key, value]) => value !== null && !written.has(key))
  if (added.length > 0) {
    if (!kept.includes(header)) {
      if (kept.length > 0 && kept.at(-1)!.trim() !== '') {
        kept.push('')
      }
      kept.push(header)
    }
    for (const [key, value] of added) {
      kept.push(`${key} = ${value}`)
    }
  }
  return kept.length ? kept.join(eol) + eol : ''
}

/** The port of an `address:port` setting such as `0.0.0.0:9021`. */
export function portOf(address: string | undefined): number | null {
  const match = address?.match(/:(\d+)\s*$/)
  return match ? Number(match[1]) : null
}

/** Host and port of a `jdbc:mysql://host:port/database` URL; MySQL's port when the URL names none. */
export function mysqlAddressOf(url: string | undefined): { host: string; port: number } | null {
  const match = url?.match(/^jdbc:(?:mysql|mariadb):\/\/([^:/?]+)(?::(\d+))?/)
  if (!match) {
    return null
  }
  return { host: match[1]!, port: match[2] ? Number(match[2]) : 3306 }
}

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

/**
 * Every setting a server reads from its `config` folder, the way the server merges them: the default files first, then the local overrides
 * (`mygs.properties` and its kind, a `my*.properties` at the root of `config`), which win.
 */
export async function readServerConfig(serverDir: string): Promise<Map<string, string>> {
  const configDir = join(serverDir, 'config')
  const files = await listPropertiesFiles(configDir)
  const isOverride = (file: string): boolean => dirname(file) === configDir && basename(file).startsWith('my')
  const ordered = [...files.filter((file) => !isOverride(file)).sort(), ...files.filter(isOverride).sort()]

  const merged = new Map<string, string>()
  for (const file of ordered) {
    for (const [key, value] of parseProperties(await readFile(file, 'utf8'))) {
      merged.set(key, value)
    }
  }
  return merged
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

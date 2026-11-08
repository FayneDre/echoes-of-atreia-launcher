/** Splits a command line on spaces, keeping double-quoted parts together and dropping their quotes. */
export function tokenizeArguments(text: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  let pending = false
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted
      pending = true
    } else if (/\s/.test(char) && !quoted) {
      if (pending) {
        tokens.push(current)
        current = ''
        pending = false
      }
    } else {
      current += char
      pending = true
    }
  }
  if (pending) {
    tokens.push(current)
  }
  return tokens
}

/**
 * The java arguments of a server's start.bat (its `JAVA ...` line), so memory settings and classpath stay where the server keeps them.
 * The batch file itself is not run: it reopens itself in Windows Terminal and ends on a PAUSE, so its window would outlive the server.
 */
export function javaArgumentsFrom(startScript: string): string[] | null {
  for (const line of startScript.split(/\r?\n/)) {
    const match = line.match(/^\s*java\s+(.+?)\s*$/i)
    if (match) {
      return tokenizeArguments(match[1]!)
    }
  }
  return null
}

const GB = 1024 ** 3
const MB = 1024 ** 2

/**
 * The game server's heap for a machine of `totalBytes`, the bands as Windows reports a machine's memory (a 16 GB one says about 15.2). The game
 * client, MySQL, the login and chat servers and Windows run beside it, so a smaller machine gives it less; the server's population guard then
 * stops the bots arriving where that heap runs short. Null keeps what start.bat says.
 */
export function heapMegabytesFor(totalBytes: number): number | null {
  if (totalBytes < 6 * GB) {
    return 1024
  }
  if (totalBytes < 10 * GB) {
    return 1536
  }
  if (totalBytes < 14 * GB) {
    return 2048
  }
  return null
}

/** A `-Xmx` or `-Xms` size in bytes (`2560m`, `2g`, `1048576k`, plain bytes), or null when it is not one. */
function sizeOf(text: string): number | null {
  const match = text.match(/^(\d+)([kmg]?)$/i)
  if (!match) {
    return null
  }
  const unit = { '': 1, k: 1024, m: MB, g: GB }[match[2]!.toLowerCase() as '' | 'k' | 'm' | 'g']
  return Number(match[1]) * unit
}

/**
 * The game server's java arguments with its heap brought down to what this machine can give it: never raised above start.bat's, whose `-Xmx` is
 * the most the server is meant to have, and `-Xms` brought down with it so the JVM does not refuse to start. Arguments without a `-Xmx` are left
 * as they are.
 */
export function fitHeapToMachine(javaArgs: string[], totalBytes: number): string[] {
  const wanted = heapMegabytesFor(totalBytes)
  const maxIndex = javaArgs.findIndex((arg) => /^-Xmx/i.test(arg))
  const current = maxIndex >= 0 ? sizeOf(javaArgs[maxIndex]!.slice(4)) : null
  if (wanted === null || current === null || current <= wanted * MB) {
    return javaArgs
  }
  return javaArgs.map((arg) => {
    if (/^-Xmx/i.test(arg)) {
      return `-Xmx${wanted}m`
    }
    const initial = /^-Xms/i.test(arg) ? sizeOf(arg.slice(4)) : null
    return initial !== null && initial > wanted * MB ? `-Xms${wanted}m` : arg
  })
}

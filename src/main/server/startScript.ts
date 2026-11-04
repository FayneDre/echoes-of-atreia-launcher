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

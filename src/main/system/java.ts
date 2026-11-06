import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface JavaCommand {
  command: string
  prefixArgs: string[]
  env: NodeJS.ProcessEnv
}

/**
 * How to run Java. The end-to-end tests set ECHOES_FAKE_JAVA to a script that plays the servers, run by the launcher's own executable as
 * plain Node; everything else about starting and stopping is then the real code.
 */
export function javaCommand(): JavaCommand {
  const fake = process.env['ECHOES_FAKE_JAVA']
  if (fake) {
    return { command: process.execPath, prefixArgs: [fake], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }
  }
  return { command: process.platform === 'win32' ? 'java.exe' : 'java', prefixArgs: [], env: process.env }
}

/** Reads the major version out of `java -version` ("25.0.1", or "1.8.0" for Java 8). */
export function parseJavaMajor(versionOutput: string): number | null {
  const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) {
    return null
  }
  const first = Number(match[1])
  return first === 1 && match[2] ? Number(match[2]) : first
}

/** The major version of the Java the servers would be started with, or null when there is none on the PATH. */
export function javaMajorVersion(): Promise<number | null> {
  const java = javaCommand()
  return new Promise((resolve) => {
    // A missing java.exe ends in an error with nothing to parse, so the error itself needs no handling.
    execFile(java.command, [...java.prefixArgs, '-version'], { env: java.env, timeout: 15_000, windowsHide: true }, (_error, stdout, stderr) => {
      // java writes its version to stderr
      resolve(parseJavaMajor(`${stderr}\n${stdout}`))
    })
  })
}

/**
 * The major version of the JDK the servers would run on, or null when that Java is a JRE or there is none: the game server compiles its
 * handlers at every start, which needs the compiler a JDK carries next to java.
 */
export function jdkMajorVersion(): Promise<number | null> {
  const java = javaCommand()
  return new Promise((resolve) => {
    execFile(
      java.command,
      [...java.prefixArgs, '-XshowSettings:properties', '-version'],
      { env: java.env, timeout: 15_000, windowsHide: true },
      (_error, stdout, stderr) => {
        const output = `${stderr}\n${stdout}`
        const home = /^\s*java\.home = (.+?)\s*$/m.exec(output)?.[1]
        const major = parseJavaMajor(output)
        if (!home || major === null) {
          resolve(null)
          return
        }
        const javac = join(home, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac')
        stat(javac).then(
          () => resolve(major),
          () => resolve(null)
        )
      }
    )
  })
}

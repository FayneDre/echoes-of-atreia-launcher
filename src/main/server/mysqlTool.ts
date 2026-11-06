import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseAddress } from '../accounts/accountStore'

const STDERR_KEPT = 4000

/** A MySQL program (`mysqldump`, `mysql`, `mysqladmin`) and how to run it. */
export interface Tool {
  command: string
  prefixArgs: string[]
  env: NodeJS.ProcessEnv
}

/** A value of a MySQL option file, quoted so a password with spaces, quotes, `#` or backslashes reads back as it is. */
export function optionValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Runs a MySQL tool with the credentials in an option file of its own, never on its command line, where any program could read them; the
 * file is removed as soon as the tool is done. Resolves to the exit code and what the tool said on its error output.
 */
export async function runTool(tool: Tool, address: DatabaseAddress, args: string[], input?: string): Promise<{ code: number; stderr: string }> {
  const optionFile = join(tmpdir(), `echoes-mysql-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.cnf`)
  const options = [
    '[client]',
    `user=${optionValue(address.user)}`,
    `password=${optionValue(address.password)}`,
    `host=${optionValue(address.host)}`,
    `port=${address.port}`,
    ''
  ].join('\n')
  await writeFile(optionFile, options, { encoding: 'utf8', mode: 0o600 })
  try {
    return await new Promise((resolve) => {
      // The option file has to come first, before any other option.
      const child = spawn(tool.command, [...tool.prefixArgs, `--defaults-extra-file=${optionFile}`, ...args], {
        env: tool.env,
        windowsHide: true,
        stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe']
      })
      let stderr = ''
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_KEPT)
      })
      if (input) {
        const source = createReadStream(input)
        // A tool that stops on an error closes its input while the dump is still being sent: writing on then fails with EPIPE, which,
        // unheard, would take the whole launcher down. The tool's own exit code and message say what happened.
        child.stdin!.on('error', () => source.destroy())
        source.on('error', () => child.kill())
        source.pipe(child.stdin!)
      }
      child.once('error', (error) => resolve({ code: -1, stderr: error.message }))
      child.once('close', (code) => resolve({ code: code ?? -1, stderr: stderr.trim() }))
    })
  } finally {
    await rm(optionFile, { force: true })
  }
}

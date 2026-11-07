import { spawn } from 'node:child_process'
import type { ClientLanguageCode, Problem } from '../shared/types'
import { clientExecutable } from './server/installation'

/**
 * The arguments the 4.8 client needs to reach a local login server, and the language it starts in. The start.bat a repack ships passes
 * `-lang:EN`, which is not among the codes the client lists (`ENU`, `FRA`, `DEU`...): only a code of that list is passed.
 */
export function clientArguments(loginPort: number, language: ClientLanguageCode): string[] {
  return ['-ip:127.0.0.1', `-port:${loginPort}`, '-loginex', `-lang:${language}`]
}

/**
 * Starts the game client, detached: it outlives the launcher. The end-to-end tests set ECHOES_FAKE_CLIENT to a script that records the
 * arguments it was given.
 */
export function launchClient(clientRoot: string, loginPort: number, language: ClientLanguageCode): Promise<Problem | null> {
  const fake = process.env['ECHOES_FAKE_CLIENT']
  const args = clientArguments(loginPort, language)
  const child = fake
    ? spawn(process.execPath, [fake, ...args], {
        cwd: clientRoot,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      })
    : spawn(clientExecutable(clientRoot), args, { cwd: clientRoot, detached: true, stdio: 'ignore' })

  return new Promise((resolve) => {
    child.once('spawn', () => {
      child.unref()
      resolve(null)
    })
    child.once('error', (error) => resolve({ code: 'client-failed', detail: error.message }))
  })
}

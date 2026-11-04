import { spawn } from 'node:child_process'
import type { Problem } from '../shared/types'
import { clientExecutable } from './server/installation'

/** The arguments the 4.8 client needs to reach a local login server, as the client's own start.bat passes them. */
export function clientArguments(loginPort: number): string[] {
  return ['-ip:127.0.0.1', `-port:${loginPort}`, '-loginex', '-lang:EN']
}

/**
 * Starts the game client, detached: it outlives the launcher. The end-to-end tests set ECHOES_FAKE_CLIENT to a script that records the
 * arguments it was given.
 */
export function launchClient(clientRoot: string, loginPort: number): Promise<Problem | null> {
  const fake = process.env['ECHOES_FAKE_CLIENT']
  const args = clientArguments(loginPort)
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

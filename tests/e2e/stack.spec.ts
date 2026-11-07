import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { FAKE_MAIN_CLASS, createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

// The game server waits for the other two, then registers with the login server: a few seconds with the fakes.
const READY_TIMEOUT = 30_000

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

async function open(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchWith(install)
  await launched.page.getByRole('button', { name: 'EN', exact: true }).click()
  return launched
}

const status = (page: Page, id: string) => page.getByTestId(`status-${id}`)

async function startAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
}

async function stopAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  for (const id of ['game', 'login', 'chat']) {
    await expect(status(page, id)).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  }
}

function portAnswers(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

function gameLog(): string {
  return readFileSync(join(install.serverRoot, 'game-server', 'log', 'server_console.log'), 'utf8')
}

function closeWindow(app: ElectronApplication): Promise<void> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
}

/**
 * Resolves when the launcher's process has exited. Playwright's own `close` event also waits for the output pipes it gave the launcher, and
 * on Windows the servers the launcher leaves running inherit those pipes, so the event would only come once the servers are gone.
 */
function exited(app: ElectronApplication): Promise<void> {
  const launcher = app.process()
  return new Promise((resolve) => {
    if (launcher.exitCode !== null) {
      resolve()
    } else {
      launcher.once('exit', () => resolve())
    }
  })
}

test('finds the installation, the client, Java and the database', async () => {
  const { app, page } = await open()
  await expect(page.getByTestId('install-server')).toHaveAttribute('data-found', 'true')
  await expect(page.getByTestId('install-client')).toHaveAttribute('data-found', 'true')
  await expect(page.getByTestId('install-java')).toContainText('Java 25')
  await expect(status(page, 'mysql')).toHaveAttribute('data-status', 'ready')
  for (const id of ['chat', 'login', 'game']) {
    await expect(status(page, id)).toHaveAttribute('data-status', 'stopped')
  }
  await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled()
  await app.close()
})

test('starts the servers in order, then stops the game server through its shutdown request', async () => {
  const { app, page } = await open()
  await startAll(page)
  await expect(status(page, 'chat')).toHaveAttribute('data-status', 'ready')
  await expect(status(page, 'login')).toHaveAttribute('data-status', 'ready')
  // the terminals are a drawer, closed until asked for
  await expect(page.getByRole('log')).toHaveCount(0)
  await page.getByTestId('terminals-toggle').click()
  await expect(page.getByRole('log')).toContainText('Connected to login server')
  await expect(page.getByRole('button', { name: 'Play' })).toBeEnabled()

  await stopAll(page)
  // Stopped by its own shutdown, the one that saves the players, and not killed.
  expect(gameLog()).toContain('Shutdown complete')
  expect(existsSync(join(install.serverRoot, 'game-server', 'shutdown.request'))).toBe(false)
  for (const port of [install.ports.chat, install.ports.login, install.ports.game]) {
    expect(await portAnswers(port)).toBe(false)
  }
  await app.close()
})

test('shows why a server stopped while starting', async () => {
  writeFileSync(join(install.serverRoot, 'game-server', 'fail-on-start'), '')
  const { app, page } = await open()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'failed', { timeout: READY_TIMEOUT })
  const problem = page.getByTestId('server-game').getByRole('alert')
  await expect(problem).toContainText('The server stopped by itself.')
  await expect(problem).toContainText('fake failure on start')
  // a failure opens its log
  await expect(page.getByTestId('terminals-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('log')).toContainText('Fake failure on start')

  await stopAll(page)
  await app.close()
})

test('gives up at once on a game server whose main thread died, says why, and starts it alone once fixed', async () => {
  test.setTimeout(120_000)
  writeFileSync(join(install.serverRoot, 'game-server', 'crash-on-start'), '')
  const { app, page } = await open()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  // not the two minutes of a port that never opens: the JVM stays up, but its log says the start is over
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'failed', { timeout: 15_000 })
  const problem = page.getByTestId('server-game').getByRole('alert')
  await expect(problem).toContainText('The server failed while starting:')
  await expect(problem).toContainText('Java Compiler ERROR: package fake.handlers does not exist')
  // the JVM left behind was ended: nothing holds the game server's folder any more
  await expect(page.getByTestId('restart-game')).toHaveText('Start')

  rmSync(join(install.serverRoot, 'game-server', 'crash-on-start'))
  await page.getByRole('button', { name: 'Show the log' }).click()
  await expect(page.getByRole('tab', { name: 'Game server' })).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('restart-game').click()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  await expect(problem).toHaveCount(0)

  // one server restarted alone: the other two keep running
  const loginLog = readFileSync(join(install.serverRoot, 'login-server', 'log', 'server_console.log'), 'utf8')
  await page.getByTestId('restart-game').click()
  await expect(status(page, 'game')).not.toHaveAttribute('data-status', 'ready')
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  await expect(page.getByTestId('restart-game')).toBeEnabled()
  expect(gameLog()).toContain('Connected to login server')
  expect(readFileSync(join(install.serverRoot, 'login-server', 'log', 'server_console.log'), 'utf8')).toBe(loginLog)
  await expect(status(page, 'login')).toHaveAttribute('data-status', 'ready')

  // "Stop the servers" during a restart wins: nothing starts again once the game server is down
  await page.getByTestId('restart-game').click()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'stopping')
  await stopAll(page)
  await page.waitForTimeout(3000)
  for (const id of ['game', 'login', 'chat']) {
    await expect(status(page, id)).toHaveAttribute('data-status', 'stopped')
  }
  await app.close()
})

test('stops a game server that is loading its world, through its shutdown request', async () => {
  writeFileSync(join(install.serverRoot, 'game-server', 'slow-register'), '')
  const { app, page } = await open()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'registering', { timeout: READY_TIMEOUT })

  await stopAll(page)
  // Its port was open, so its shutdown hook was there to save: it was asked, not killed.
  expect(gameLog()).toContain('Shutdown complete')
  await expect(page.getByTestId('server-game').getByRole('alert')).toHaveCount(0)
  await app.close()
})

test('ends a game server still loading its data, which has nothing to save yet', async () => {
  writeFileSync(join(install.serverRoot, 'game-server', 'slow-start'), '')
  const { app, page } = await open()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(status(page, 'login')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'starting')

  await stopAll(page)
  expect(gameLog()).not.toContain('Shutdown requested')
  expect(existsSync(join(install.serverRoot, 'game-server', 'shutdown.request'))).toBe(false)
  await expect(page.getByTestId('server-game').getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start the servers' })).toBeEnabled()
  await app.close()
})

test('launches the client on the login server port', async () => {
  const { app, page } = await open()
  await startAll(page)
  await page.getByRole('button', { name: 'Play' }).click()

  const argsFile = join(install.clientRoot, 'client-args.json')
  await expect.poll(() => existsSync(argsFile), { timeout: 10_000 }).toBe(true)
  expect(JSON.parse(readFileSync(argsFile, 'utf8'))).toEqual(['-ip:127.0.0.1', `-port:${install.ports.loginClient}`, '-loginex', '-lang:ENU'])

  await stopAll(page)
  await app.close()
})

test('asks before closing while the servers run, and stops them cleanly', async () => {
  const { app, page } = await open()
  await startAll(page)

  await closeWindow(app)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('The servers are still running')

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'ready')

  await closeWindow(app)
  const closed = exited(app)
  await dialog.getByRole('button', { name: 'Stop them and quit' }).click()
  await closed
  expect(gameLog()).toContain('Shutdown complete')
  expect(await portAnswers(install.ports.game)).toBe(false)
})

test('takes over servers left running when it was closed', async () => {
  const first = await open()
  await startAll(first.page)
  await closeWindow(first.app)
  const closed = exited(first.app)
  await first.page.getByRole('dialog').getByRole('button', { name: 'Leave them running and quit' }).click()
  await closed
  expect(await portAnswers(install.ports.game)).toBe(true)

  const { app, page } = await open()
  await expect(status(page, 'game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  await expect(page.getByTestId('server-game')).toContainText('started outside the launcher')
  await stopAll(page)
  expect(gameLog()).toContain('Shutdown complete')
  await app.close()
})

test('does not kill a server it cannot tell from another of the same kind', async () => {
  const first = await open()
  await startAll(first.page)
  await closeWindow(first.app)
  const closed = exited(first.app)
  await first.page.getByRole('dialog').getByRole('button', { name: 'Leave them running and quit' }).click()
  await closed

  // a second login server, as another install or one started by hand would be: its command line names the same class
  const other = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', FAKE_MAIN_CLASS.login], { stdio: 'ignore' })
  try {
    const second = await open()
    await expect(status(second.page, 'game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
    await second.page.getByRole('button', { name: 'Stop the servers' }).click()
    // the game server stops through its request, in its own folder; the login server is not killed on a guess
    await expect(status(second.page, 'game')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
    expect(gameLog()).toContain('Shutdown complete')
    await expect(second.page.getByTestId('server-login')).toContainText('cannot tell which one', { timeout: READY_TIMEOUT })
    expect(other.exitCode).toBeNull()
    await closeWindow(second.app)
    const secondClosed = exited(second.app)
    await second.page.getByRole('dialog').getByRole('button', { name: 'Leave them running and quit' }).click()
    await secondClosed
  } finally {
    other.kill()
  }

  // with the other one gone, the launcher knows its own again and stops it
  const third = await open()
  await expect(status(third.page, 'login')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  await stopAll(third.page)
  await third.app.close()
})

import { appendFileSync, existsSync, mkdirSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

const READY_TIMEOUT = 30_000

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

async function open(env: Record<string, string> = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchWith(install, env)
  await launched.page.getByRole('button', { name: 'EN', exact: true }).click()
  return launched
}

const gameStatus = (page: Page) => page.getByTestId('status-game')

async function startAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(gameStatus(page)).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
}

async function stopAll(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  // all three: a server still stopping would make the close ask what to do with it
  for (const id of ['game', 'login', 'chat']) {
    await expect(page.getByTestId(`status-${id}`)).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  }
}

const windowVisible = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)

test('keeps the servers in the background when the window is closed, and comes back from the notification area', async () => {
  const { app, page } = await open()
  await startAll(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await page.getByTestId('quit-background').click()
  await expect.poll(() => windowVisible(app)).toBe(false)
  // the launcher is still there, the servers still its own
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  await expect(gameStatus(page)).toHaveAttribute('data-status', 'ready')
  await stopAll(page)
  await app.close()
})

test('makes a problem report with the logs, the bot notes and a summary, and offers its issue', async () => {
  const { app, page } = await open()
  await startAll(page)
  appendFileSync(join(install.serverRoot, 'game-server', 'log', 'server_console.log'), 'BOT NOTE #1 by Nemesis: stuck at the bridge\n')
  await page.getByTestId('report-open').click()
  const dialog = page.getByTestId('report-dialog')
  await expect(dialog).toContainText('Nothing is sent')
  await dialog.getByTestId('report-create').click()
  await expect(dialog.getByTestId('report-done')).toContainText(/Report created: report-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip/)
  await expect(dialog.getByRole('button', { name: 'Open an issue on GitHub' })).toBeVisible()
  const reports = readdirSync(join(install.serverRoot, 'reports'))
  expect(reports).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await stopAll(page)
  await app.close()
})

test('colours the error lines of a terminal', async () => {
  const { app, page } = await open()
  await startAll(page)
  appendFileSync(join(install.serverRoot, 'game-server', 'log', 'server_console.log'), '12:00:00.000 ERROR [main] something broke\n')
  await page.getByTestId('terminals-toggle').click()
  await expect(page.locator('.terminal .log-error')).toContainText('something broke')
  await expect(page.getByTestId('terminal-folder')).toBeVisible()
  await stopAll(page)
  await app.close()
})

test('draws the bots in the world over the last hour', async () => {
  const { app, page } = await open({ ECHOES_BOT_SAMPLE_MS: '300' })
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  await expect(page.getByTestId('bot-history')).toContainText('The curve starts once the game server is ready')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await startAll(page)
  // a point is counted every 300 ms; the page reads them when it opens
  await page.waitForTimeout(1_000)
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  await expect(page.getByTestId('bot-history-elyos')).toHaveText('Elyos 1')
  await expect(page.getByTestId('bot-history-asmodians')).toHaveText('Asmodian 1')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await stopAll(page)
  await app.close()
})

test('starts the servers when the launcher opens, once asked, and makes the desktop shortcut', async () => {
  const desktop = join(install.root, 'desktop')
  mkdirSync(desktop)
  const first = await open({ ECHOES_DESKTOP_DIR: desktop })
  await first.page.getByTestId('install-summary').click()
  const dialog = first.page.getByTestId('install-dialog')
  // run from its sources, the launcher is no program Windows could start
  await expect(dialog.getByTestId('option-start-with-windows').getByRole('checkbox')).toBeDisabled()
  await dialog.getByTestId('option-desktop-shortcut').getByRole('checkbox').check()
  await expect.poll(() => existsSync(join(desktop, 'Echoes of Atreia.lnk'))).toBe(true)
  await dialog.getByTestId('option-desktop-shortcut').getByRole('checkbox').uncheck()
  await expect.poll(() => existsSync(join(desktop, 'Echoes of Atreia.lnk'))).toBe(false)
  // the box follows the launcher's state, which the saved setting publishes
  await dialog.getByTestId('option-start-servers').getByRole('checkbox').click()
  await expect(dialog.getByTestId('option-start-servers').getByRole('checkbox')).toBeChecked()
  await first.app.close()

  const { app, page } = await open()
  await expect(gameStatus(page)).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  await stopAll(page)
  await app.close()
})

test('cleans up an archived log past a month at start, says so, and can be turned off', async () => {
  const archived = join(install.serverRoot, 'game-server', 'log', 'archived')
  mkdirSync(archived, { recursive: true })
  const old = join(archived, '2026-09-01 10.00 to 2026-09-01 12.00.zip')
  const recent = join(archived, 'recent.zip')
  writeFileSync(old, Buffer.alloc(2048))
  writeFileSync(recent, Buffer.alloc(2048))
  const monthsAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
  utimesSync(old, monthsAgo, monthsAgo)

  // deleted rather than sent to the recycle bin: a test run leaves nothing in the person's
  const first = await open({ ECHOES_CLEANUP_DELETE: '1' })
  await expect.poll(() => existsSync(old)).toBe(false)
  expect(existsSync(recent)).toBe(true)
  await first.page.getByTestId('install-summary').click()
  const option = first.page.getByTestId('option-cleanup')
  await expect(option.getByRole('checkbox')).toBeChecked()
  await expect(option).toContainText('At this start: 1 files sent to the recycle bin')
  await option.getByRole('checkbox').click()
  await expect(option.getByRole('checkbox')).not.toBeChecked()
  await first.app.close()

  // turned off: an old one stays
  writeFileSync(old, Buffer.alloc(2048))
  utimesSync(old, monthsAgo, monthsAgo)
  const { app, page } = await open({ ECHOES_CLEANUP_DELETE: '1' })
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await page.waitForTimeout(1_000)
  expect(existsSync(old)).toBe(true)
  await app.close()
})

test('does not clean up in the developer mode unless asked', async () => {
  const archived = join(install.serverRoot, 'game-server', 'log', 'archived')
  mkdirSync(archived, { recursive: true })
  const old = join(archived, 'old.zip')
  writeFileSync(old, Buffer.alloc(2048))
  const monthsAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
  utimesSync(old, monthsAgo, monthsAgo)
  const { app, page } = await open({ ECHOES_CLEANUP_DELETE: '1', ECHOES_DEVELOPER_DEFAULT: '' })
  await page.getByTestId('install-summary').click()
  await expect(page.getByTestId('option-developer').getByRole('checkbox')).toBeChecked()
  await expect(page.getByTestId('option-cleanup').getByRole('checkbox')).not.toBeChecked()
  await page.waitForTimeout(1_000)
  expect(existsSync(old)).toBe(true)
  await app.close()
})

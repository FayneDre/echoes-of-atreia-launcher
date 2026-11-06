import { writeFileSync } from 'node:fs'
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

async function open(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchWith(install)
  await launched.page.getByRole('button', { name: 'EN', exact: true }).click()
  return launched
}

async function startServers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
}

async function stopServers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
}

function writeManifest(apiLevel: number): void {
  writeFileSync(join(install.serverRoot, 'manifest.json'), JSON.stringify({ source: 'deploy', version: 'dev', revision: 'abc1234', apiLevel }))
}

test('says which server to install when the running one is too old', async () => {
  writeFileSync(join(install.serverRoot, 'game-server', 'old-api'), '')
  const { app, page } = await open()
  await startServers(page)
  await page.getByRole('button', { name: 'Server settings' }).click()
  await expect(page.getByTestId('server-too-old')).toContainText('install server v0.1.0-beta.1 or later', { timeout: 10_000 })
  // only on the pages that need the server: the home page works with any server
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.getByTestId('server-too-old')).toHaveCount(0)
  await stopServers(page)
  await app.close()
})

test('says nothing of a running server at the level it needs', async () => {
  const { app, page } = await open()
  await startServers(page)
  await page.getByRole('button', { name: 'Server settings' }).click()
  // the answer to version comes within a second of the server being ready
  await page.waitForTimeout(2_000)
  await expect(page.getByTestId('server-too-old')).toHaveCount(0)
  await stopServers(page)
  await app.close()
})

test('reads a stopped server from its manifest', async () => {
  writeManifest(0)
  const { app, page } = await open()
  await page.getByRole('button', { name: 'Server settings' }).click()
  await expect(page.getByTestId('server-too-old')).toContainText('launcher API level 0, it needs 1')
  await app.close()

  writeManifest(1)
  const again = await open()
  await again.page.getByRole('button', { name: 'Server settings' }).click()
  await expect(again.page.getByTestId('group-xp')).toBeVisible()
  await expect(again.page.getByTestId('server-too-old')).toHaveCount(0)
  await again.app.close()
})

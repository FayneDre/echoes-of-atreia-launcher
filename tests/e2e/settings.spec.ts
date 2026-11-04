import { readFileSync } from 'node:fs'
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

async function openSettings(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchWith(install)
  await launched.page.getByRole('button', { name: 'EN' }).click()
  await launched.page.getByRole('button', { name: 'Server settings' }).click()
  await expect(launched.page.getByLabel('Experience (XP)')).toBeVisible()
  return launched
}

function overrides(): string {
  return readFileSync(join(install.serverRoot, 'game-server', 'config', 'mygs.properties'), 'latin1')
}

test('saves the settings to mygs.properties and shows them again at the next start', async () => {
  const first = await openSettings()
  const page = first.page
  await expect(page.getByLabel('Experience (XP)')).toHaveValue('1')
  await expect(page.getByLabel('Daily Glory Point loss')).toHaveValue('100')

  await page.getByLabel('Experience (XP)').fill('3')
  await page.getByLabel('Abyss Points (AP)').fill('2')
  await page.getByLabel('Daily Glory Point loss').fill('0')
  await page.getByLabel('Characters of both factions on one account').check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()

  const text = overrides()
  expect(text).toContain('gameserver.rates.xp.solo = 3.0, 6.0')
  expect(text).toContain('gameserver.rates.ap.pve = 2.0, 4.0')
  expect(text).toContain('gameserver.topranking.gp_loss.SUPREME_COMMANDER = 0')
  expect(text).toContain('gameserver.character.creation.mode = 1')
  // The person's own lines are still there.
  expect(text).toContain('database.user = aion')
  // Nothing runs: no restart to ask for.
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)
  await first.app.close()

  const second = await openSettings()
  await expect(second.page.getByLabel('Experience (XP)')).toHaveValue('3')
  await expect(second.page.getByLabel('Abyss Points (AP)')).toHaveValue('2')
  await expect(second.page.getByLabel('Daily Glory Point loss')).toHaveValue('0')
  await expect(second.page.getByLabel('Characters of both factions on one account')).toBeChecked()
  await second.app.close()
})

test('goes back to the official values, which leaves nothing of them in mygs.properties', async () => {
  const { app, page } = await openSettings()
  await page.getByLabel('Experience (XP)').fill('5')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  expect(overrides()).toContain('gameserver.rates.xp.solo = 5.0, 10.0')

  await page.getByRole('button', { name: 'Official values' }).click()
  await expect(page.getByLabel('Experience (XP)')).toHaveValue('1')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  expect(overrides()).not.toContain('gameserver.rates')
  expect(overrides()).toContain('database.user = aion')
  await app.close()
})

test('refuses a rate the server would not take', async () => {
  const { app, page } = await openSettings()
  await page.getByLabel('Experience (XP)').fill('0')
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await page.getByLabel('Experience (XP)').fill('')
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()
  await app.close()
})

test('asks for a restart when the settings change while the game server runs', async () => {
  const { app, page } = await openSettings()
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })

  await page.getByRole('button', { name: 'Server settings' }).click()
  await page.getByLabel('Glory Points (GP) gained').fill('2')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByTestId('restart-needed')).toContainText('Restart the servers')

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  await app.close()
})

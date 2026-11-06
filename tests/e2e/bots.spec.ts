import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

test('lists the bots by faction, with their level, class and map, and believes "in the world" only from a running server', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN' }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()

  const elyos = page.getByTestId('faction-ELYOS')
  // the database says Zephyra is online, but no game server runs: what a crash or a kill leaves behind
  await expect(elyos).toContainText('2 bots')
  await expect(elyos).not.toContainText('in the world')
  await expect(elyos.getByTestId('bot-Zephyra')).toContainText('Zephyra3ClericSanctum')
  await expect(elyos.getByTestId('bot-Zephyra')).not.toContainText('In the world')
  // Highest level first.
  await expect(elyos.getByRole('listitem').first()).toContainText('Zephyra')

  const asmodians = page.getByTestId('faction-ASMODIANS')
  await expect(asmodians).toContainText('1 bots')
  await expect(asmodians.getByTestId('bot-Brakka')).toContainText('Ishalgen')
  // A bot is under its own faction only.
  await expect(asmodians.getByTestId('bot-Zephyra')).toHaveCount(0)

  await page.getByLabel('Search a bot').fill('ald')
  await expect(page.getByTestId('bot-Aldric')).toBeVisible()
  await expect(page.getByTestId('bot-Zephyra')).toHaveCount(0)
  await expect(asmodians).toContainText('No bot matches.')
  await app.close()
})

const overrides = (): string => readFileSync(join(install.serverRoot, 'game-server', 'config', 'mygs.properties'), 'latin1')

async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('settings-bots').getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible({ timeout: 10_000 })
}

test('sets how the bots earn experience, fight, speak and trade', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN' }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()

  await page.getByLabel('Experience — Monsters, alone').fill('5')
  // One percent is the floor: zero would be no experience at all.
  await page.getByLabel('Experience — Monsters, in a group').fill('0')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await page.getByLabel('Experience — Monsters, in a group').fill('2')

  await page.getByRole('tab', { name: 'PvP' }).click()
  await page.getByLabel('PvP — Bots attack players').uncheck()
  await page.getByLabel('PvP — Share of fighters').fill('50')

  await page.getByRole('tab', { name: 'Chat' }).click()
  await page.getByLabel('Chat — Language').selectOption({ label: 'English' })
  await save(page)

  const text = overrides()
  expect(text).toContain('gameserver.playerbot.xp.solo = 5\n')
  expect(text).toContain('gameserver.playerbot.xp.group = 2\n')
  expect(text).toContain('gameserver.playerbot.pvp.enable = false\n')
  expect(text).toContain('gameserver.playerbot.pvp.share.fighter = 50\n')
  expect(text).toContain('gameserver.playerbot.chat.language = EN\n')
  // What was not touched is not written.
  expect(text).not.toContain('pvp.share.peaceful')
  // The server settings page does not show the bots' own.
  await page.getByRole('button', { name: 'Server settings' }).click()
  await expect(page.getByRole('tab', { name: 'Broker' })).toHaveCount(0)
  await app.close()
})

test('saves a bot setting while the file holds another outside what the page offers', async () => {
  // The server takes a smaller broker than the page offers: that value must not keep the others from being saved.
  appendFileSync(join(install.serverRoot, 'game-server', 'config', 'mygs.properties'), 'gameserver.playerbot.broker.size = 3000\n', 'latin1')
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN' }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  await page.getByLabel('Experience — Monsters, alone').fill('3')
  await save(page)
  const text = overrides()
  expect(text).toContain('gameserver.playerbot.xp.solo = 3\n')
  expect(text).toContain('gameserver.playerbot.broker.size = 3000\n')
  await app.close()
})

test('asks for a restart for a bot setting the game server reads at start only, and keeps asking after a later save', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Bots', exact: true }).click()

  await page.getByRole('tab', { name: 'Chat' }).click()
  await page.getByLabel('Chat — Bots speak').uncheck()
  await save(page)
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)

  await page.getByRole('tab', { name: 'Broker' }).click()
  await expect(page.getByTestId('group-broker')).toContainText('read at start')
  await page.getByLabel('Broker — Buys players’ listings').uncheck()
  await save(page)
  await expect(page.getByTestId('restart-needed')).toContainText('Restart the servers')

  // A later save the server applies at once does not take the notice away: the buyer still waits for a start.
  await page.getByLabel('Broker — Listings per faction').fill('8000')
  await save(page)
  await expect(page.getByTestId('restart-needed')).toContainText('Restart the servers')

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await app.close()
})

import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { save } from './save'
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
  await page.getByRole('button', { name: 'EN', exact: true }).click()
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

test('sets how the bots earn experience, fight, speak and trade', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()

  // each mode says what it does under the setting's name, and the percent it does not use is greyed out
  const population = page.getByTestId('group-botDensity')
  const percent = page.getByLabel('Population — Percent of a full ground')
  await expect(population).toContainText('The percent is not used.')
  await expect(percent).toBeDisabled()
  await page.getByLabel('Population — Hunting grounds filled').selectOption({ label: 'Constant' })
  await expect(population).toContainText('Every map stays at the percent')
  await expect(percent).toBeEnabled()
  await percent.fill('60')
  // the PC's RAM mark is greyed out while its switch is off
  const ramSwitch = page.getByLabel('Population — Stop arrivals when the PC’s RAM is full')
  const ramMark = page.getByLabel('Population — PC RAM mark')
  await expect(ramMark).toBeEnabled()
  await ramSwitch.uncheck()
  await expect(ramMark).toBeDisabled()
  await ramSwitch.check()
  await ramMark.fill('80')

  await page.getByRole('tab', { name: 'Experience' }).click()
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
  expect(text).toContain('gameserver.playerbot.density.mode = FIXED\n')
  expect(text).toContain('gameserver.playerbot.density.percent = 60\n')
  expect(text).toContain('gameserver.playerbot.guard.machine.hold = 80\n')
  expect(text).not.toContain('guard.machine.enable')
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
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  await page.getByRole('tab', { name: 'Experience' }).click()
  await page.getByLabel('Experience — Monsters, alone').fill('3')
  await save(page)
  const text = overrides()
  expect(text).toContain('gameserver.playerbot.xp.solo = 3\n')
  expect(text).toContain('gameserver.playerbot.broker.size = 3000\n')
  await app.close()
})

test('shows where the running server’s population stands, and nothing while no game server runs', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  await expect(page.getByTestId('faction-ELYOS')).toBeVisible()
  await expect(page.getByTestId('population')).toHaveCount(0)

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  const population = page.getByTestId('population')
  await expect(population).toContainText('412 present of the 450 wanted (88 in reserve, out of the world)')
  await expect(population).toContainText('Constant, 60 %')
  await expect(population).toContainText('Paused: the server is short of memory, free RAM on the PC')
  await expect(population).toContainText('86 %')
  await expect(population).toContainText('PC RAM in use92 %')

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await app.close()
})

test('asks for a restart for a bot setting the game server reads at start only, and keeps asking after a later save', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
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
  const tabBefore = await page.getByRole('tab', { name: 'Broker' }).boundingBox()
  await save(page)
  await expect(page.getByTestId('restart-needed')).toContainText('Restart the servers')
  // the notice lies over the page: nothing under it moves down
  expect((await page.getByRole('tab', { name: 'Broker' }).boundingBox())?.y).toBe(tabBefore?.y)

  // A later save the server applies at once does not take the notice away: the buyer still waits for a start.
  await page.getByLabel('Broker — Listings per faction').fill('8000')
  await save(page)
  await expect(page.getByTestId('restart-needed')).toContainText('Restart the servers')

  // its cross closes it
  await page.getByTestId('restart-needed').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await app.close()
})

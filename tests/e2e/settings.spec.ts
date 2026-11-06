import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { save } from './save'
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
  await launched.page.getByRole('button', { name: 'EN', exact: true }).click()
  await launched.page.getByRole('button', { name: 'Server settings' }).click()
  await expect(launched.page.getByTestId('group-xp')).toBeVisible()
  return launched
}

function overrides(): string {
  return readFileSync(join(install.serverRoot, 'game-server', 'config', 'mygs.properties'), 'latin1')
}

const group = (page: Page, id: string): Locator => page.getByTestId(`group-${id}`)

// The families are tabs: one shows at a time.
async function select(page: Page, title: string): Promise<void> {
  await page.getByRole('tab', { name: title }).click()
}

test('sets a whole group at once, or each of its settings', async () => {
  const { app, page } = await openSettings()
  await page.getByLabel('Experience (XP) — All').fill('3')
  await select(page, 'Experience (XP)')
  await expect(page.getByLabel('Experience (XP) — Monsters, alone')).toHaveValue('3')
  await expect(page.getByLabel('Experience (XP) — Quests')).toHaveValue('3')

  // One setting apart: the group's field no longer has a single value.
  await page.getByLabel('Experience (XP) — Monsters, in a group').fill('5')
  await expect(page.getByLabel('Experience (XP) — All')).toHaveValue('')
  await expect(page.getByLabel('Experience (XP) — All')).toHaveAttribute('placeholder', 'mixed')
  await expect(group(page, 'xp')).toContainText('6 changed')
  await save(page)

  const text = overrides()
  expect(text).toContain('gameserver.rates.xp.solo = 3.0\n')
  expect(text).toContain('gameserver.rates.xp.group = 5.0\n')
  expect(text).toContain('gameserver.rates.xp.pvp = 3.0\n')
  // Another group, untouched, writes nothing.
  expect(text).not.toContain('gameserver.rates.ap.')
  // The person's own lines are still there.
  expect(text).toContain('database.user = aion')
  await app.close()

  const again = await openSettings()
  await select(again.page, 'Experience (XP)')
  await expect(again.page.getByLabel('Experience (XP) — Monsters, in a group')).toHaveValue('5')
  await expect(again.page.getByLabel('Experience (XP) — Monsters, alone')).toHaveValue('3')
  await again.app.close()
})

test('sets the daily Glory Point loss as a share of the official loss, or rank by rank', async () => {
  const { app, page } = await openSettings()
  await select(page, 'Daily Glory Point loss')
  await page.getByLabel('Daily Glory Point loss — All').fill('50')
  await expect(page.getByLabel('Daily Glory Point loss — Officer, 1 star')).toHaveValue('5')
  await expect(page.getByLabel('Daily Glory Point loss — Supreme Commander')).toHaveValue('110')
  await expect(group(page, 'gpLoss')).toContainText('official 219')

  await page.getByLabel('Daily Glory Point loss — Supreme Commander').fill('0')
  await expect(page.getByLabel('Daily Glory Point loss — All')).toHaveValue('')
  await save(page)
  expect(overrides()).toContain('gameserver.topranking.gp_loss.STAR1_OFFICER = 5\n')
  expect(overrides()).toContain('gameserver.topranking.gp_loss.SUPREME_COMMANDER = 0\n')
  await app.close()
})

test('sets the chances of success in percent, and the factions', async () => {
  const { app, page } = await openSettings()
  await select(page, 'Chances of success')
  await expect(page.getByLabel('Chances of success — Manastone socketing')).toHaveValue('75')
  await page.getByLabel('Chances of success — Manastone socketing').fill('100')
  await select(page, 'Accounts')
  await page.getByLabel('Accounts — Characters of both factions on one account').check()
  await save(page)
  expect(overrides()).toContain('gameserver.rates.manastone_chances = 100.0\n')
  expect(overrides()).toContain('gameserver.character.creation.mode = 1\n')
  await app.close()
})

test('goes back to the official values, which leaves nothing of them in mygs.properties', async () => {
  const { app, page } = await openSettings()
  await select(page, 'Abyss Points (AP)')
  await page.getByLabel('Abyss Points (AP) — All').fill('4')
  await save(page)
  expect(overrides()).toContain('gameserver.rates.ap.pve = 4.0\n')
  // Raising every gain does not raise what a PvP death costs.
  expect(overrides()).not.toContain('ap.pvp.loss')

  await page.getByRole('button', { name: 'Everything to the official values' }).click()
  await expect(page.getByLabel('Abyss Points (AP) — All')).toHaveValue('1')
  await save(page)
  expect(overrides()).not.toContain('gameserver.rates')
  expect(overrides()).not.toContain('Echoes of Atreia launcher')
  expect(overrides()).toContain('database.user = aion')
  await app.close()
})

test('leaves every setting it was not asked to change as the file had it', async () => {
  // Values the page cannot show as they are: a premium rate of its own, the character reservation mode.
  const file = join(install.serverRoot, 'game-server', 'config', 'mygs.properties')
  writeFileSync(file, 'gameserver.rates.xp.solo = 2.0, 5.0\ngameserver.character.creation.mode = 2\n', 'latin1')
  const { app, page } = await openSettings()
  await select(page, 'Divine Points (DP)')
  await page.getByLabel('Divine Points (DP) — All').fill('3')
  await save(page)
  expect(overrides()).toContain('gameserver.rates.xp.solo = 2.0, 5.0\n')
  expect(overrides()).toContain('gameserver.character.creation.mode = 2\n')
  expect(overrides()).toContain('gameserver.rates.dp.pve = 3.0\n')
  await app.close()
})

test('keeps changes not saved yet across a look at the home page', async () => {
  const { app, page } = await openSettings()
  await page.getByLabel('Experience (XP) — All').fill('4')
  await expect(page.getByTestId('unsaved')).toBeVisible()
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Server settings' }).click()
  await expect(page.getByLabel('Experience (XP) — All')).toHaveValue('4')
  await save(page)
  await expect(page.getByTestId('unsaved')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await app.close()
})

test('takes a decimal typed one key at a time', async () => {
  const { app, page } = await openSettings()
  const field = page.getByLabel('Experience (XP) — All')
  await field.fill('')
  await field.pressSequentially('1.5')
  await expect(field).toHaveValue('1.5')
  await save(page)
  expect(overrides()).toContain('gameserver.rates.xp.solo = 1.5\n')
  await app.close()
})

test('refuses a value the server would not take', async () => {
  const { app, page } = await openSettings()
  await page.getByLabel('Experience (XP) — All').fill('-1')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await page.getByLabel('Experience (XP) — All').fill('')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await page.getByLabel('Experience (XP) — All').fill('2')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await app.close()
})

test('applies the settings at once when the game server runs, without asking for a restart', async () => {
  const { app, page } = await openSettings()
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })

  await page.getByRole('button', { name: 'Server settings' }).click()
  await select(page, 'Glory Points (GP)')
  await page.getByLabel('Glory Points (GP) — All').fill('2')
  await save(page)
  await expect.poll(() => readFileSync(join(install.serverRoot, 'game-server', 'log', 'server_console.log'), 'utf8')).toContain('configuration reloaded')
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  await app.close()
})

test('asks for a restart when the game server cannot read the settings again', async () => {
  // A game server from before the admin channel.
  writeFileSync(join(install.serverRoot, 'game-server', 'no-admin'), '')
  const { app, page } = await openSettings()
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })

  await page.getByRole('button', { name: 'Server settings' }).click()
  await select(page, 'Glory Points (GP)')
  await page.getByLabel('Glory Points (GP) — All').fill('2')
  await save(page)
  await expect(page.getByTestId('restart-needed')).toContainText('Restart the servers')

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  await expect(page.getByTestId('restart-needed')).toHaveCount(0)
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  await app.close()
})

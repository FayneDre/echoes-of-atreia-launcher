import { expect, test } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

test('lists the bots by faction, with their level, class, map and whether they are in the world', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN' }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()

  const elyos = page.getByTestId('faction-ELYOS')
  await expect(elyos).toContainText('2 bots, 1 in the world')
  await expect(elyos.getByTestId('bot-Zephyra')).toContainText('Level 3 · Cleric · Sanctum')
  await expect(elyos.getByTestId('bot-Zephyra')).toContainText('In the world')
  await expect(elyos.getByTestId('bot-Aldric')).not.toContainText('In the world')
  // Highest level first.
  await expect(elyos.getByRole('listitem').first()).toContainText('Zephyra')

  const asmodians = page.getByTestId('faction-ASMODIANS')
  await expect(asmodians).toContainText('1 bots, 1 in the world')
  await expect(asmodians.getByTestId('bot-Brakka')).toContainText('Ishalgen')
  // A bot is under its own faction only.
  await expect(asmodians.getByTestId('bot-Zephyra')).toHaveCount(0)

  await page.getByLabel('Search a bot').fill('ald')
  await expect(page.getByTestId('bot-Aldric')).toBeVisible()
  await expect(page.getByTestId('bot-Zephyra')).toHaveCount(0)
  await expect(asmodians).toContainText('No bot matches.')
  await app.close()
})

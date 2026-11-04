import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createFakeInstall, FAKE_ACCOUNTS, launchWith, writeFakeDatabase, type FakeInstall } from './fakeInstall'

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

async function openAccount(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchWith(install)
  await launched.page.getByRole('button', { name: 'EN' }).click()
  await launched.page.getByRole('button', { name: 'Account', exact: true }).click()
  return launched
}

async function signIn(page: Page, name: string, password: string): Promise<void> {
  await page.getByLabel('Account name').fill(name)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

function savedSettings(): string {
  return readFileSync(join(install.userData, 'settings.json'), 'utf8')
}

test('signs in, lists the characters of the account, and remembers the one played with', async () => {
  const first = await openAccount()
  let page = first.page

  await signIn(page, 'player1', 'wrong')
  await expect(page.getByRole('alert')).toContainText('Wrong password.')
  await signIn(page, 'nobody', 'secret')
  await expect(page.getByRole('alert')).toContainText('no account by that name')

  await signIn(page, 'player1', 'secret')
  const aeris = page.getByTestId('character-Aeris')
  await expect(aeris).toContainText('Level 3 · Cleric · Elyos')
  await expect(aeris).toContainText('Sanctum')
  await expect(aeris).toContainText('In game')
  await expect(page.getByTestId('character-Borin')).toContainText('Level 2 · Gladiator · Asmodian')
  await expect(page.getByTestId('character-Borin')).toContainText('Ishalgen')
  // Another account's characters are not this one's.
  await expect(page.getByTestId('character-Nobody')).toHaveCount(0)

  await page.getByTestId('character-Borin').click()
  await expect(page.getByTestId('character-Borin')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('playing')).toHaveText('Playing: Borin')

  // Kept, and never in clear.
  expect(savedSettings()).not.toContain('secret')
  await first.app.close()

  const second = await openAccount()
  page = second.page
  await expect(page.getByTestId('playing')).toHaveText('Playing: Borin')
  await expect(page.getByTestId('character-Borin')).toHaveAttribute('aria-checked', 'true')
  await second.app.close()
})

test('keeps several accounts, each with its own character, and switches between them', async () => {
  const { app, page } = await openAccount()
  await signIn(page, 'player1', 'secret')
  await page.getByTestId('character-Aeris').click()

  await page.getByRole('button', { name: '+ Add an account' }).click()
  await signIn(page, 'player2', 'other')
  await expect(page.getByTestId('character-Cyra')).toContainText('Level 1 · Songweaver · Elyos')
  await expect(page.getByTestId('character-Cyra')).toContainText('Being deleted')
  await expect(page.getByTestId('character-Cyra')).toContainText('Unknown map')
  await page.getByTestId('character-Cyra').click()
  await expect(page.getByTestId('playing')).toHaveText('Playing: Cyra')

  await page.getByRole('tab', { name: 'player1' }).click()
  await expect(page.getByTestId('playing')).toHaveText('Playing: Aeris')
  await expect(page.getByTestId('character-Aeris')).toHaveAttribute('aria-checked', 'true')

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Forget this account' }).click()
  await expect(page.getByRole('tab', { name: 'player1' })).toHaveCount(0)
  await expect(page.getByTestId('playing')).toHaveText('Playing: Cyra')
  await app.close()
})

test('asks for the password again when it was changed on the server', async () => {
  const first = await openAccount()
  await signIn(first.page, 'player1', 'secret')
  await expect(first.page.getByTestId('character-Aeris')).toBeVisible()
  await first.app.close()

  writeFakeDatabase(install, FAKE_ACCOUNTS.map((account) => (account.name === 'player1' ? { ...account, password: 'changed' } : account)))
  const { app, page } = await openAccount()
  await expect(page.getByRole('alert')).toContainText('no longer opens this account')
  await expect(page.getByTestId('character-Aeris')).toHaveCount(0)
  await expect(page.getByLabel('Account name')).toHaveValue('player1')
  await page.getByLabel('Password').fill('changed')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('character-Aeris')).toBeVisible()
  await app.close()
})

test('teleports the character played, through the game server', async () => {
  const { app, page } = await openAccount()
  await signIn(page, 'player1', 'secret')
  await page.getByTestId('character-Aeris').click()
  await expect(page.getByTestId('teleport')).toContainText('Start the servers and log in')

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Account', exact: true }).click()

  // Each name once, and a search narrows the list.
  const places = page.getByLabel('Places')
  await expect(places.getByRole('option')).toHaveText(['Pandaemonium', 'Sanctum'])
  await page.getByLabel('Search a place').fill('sanc')
  await expect(places.getByRole('option')).toHaveText(['Sanctum'])
  await places.selectOption({ label: 'Sanctum' })
  await page.getByRole('button', { name: 'Teleport', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Done' })).toBeVisible()
  const log = join(install.serverRoot, 'game-server', 'log', 'server_console.log')
  await expect.poll(() => readFileSync(log, 'utf8')).toContain('teleport 101 110010000 1 2 3')

  // A character that is not in game is not offered the teleport.
  await page.getByTestId('character-Borin').click()
  await expect(page.getByTestId('teleport')).toContainText('log in with the character')
  await expect(page.getByLabel('Places')).toHaveCount(0)

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await app.close()
})

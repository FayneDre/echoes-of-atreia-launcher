import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, writeLanguagePack, type FakeInstall } from './fakeInstall'

const READY_TIMEOUT = 30_000
// each test starts the servers, and the first opens the launcher twice: past the default 30 s when the whole suite runs at once
test.describe.configure({ timeout: 90_000 })

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

const closeInstall = (page: Page) => page.getByTestId('install-dialog').getByRole('button', { name: 'Close' }).click()

const argsFile = (): string => join(install.clientRoot, 'client-args.json')

test('starts the client in the language chosen among the complete packs', async () => {
  // a French pack of another build, without the 4.8 cutscenes, and a German one without its deu.pak
  writeLanguagePack(install.clientRoot, 'FRA', ['Data/CutScene/movie/mv_f5_intro.bik'])
  writeLanguagePack(install.clientRoot, 'DEU', ['Data/Data.pak'], false)
  const { app, page } = await open()
  await page.getByTestId('install-summary').click()
  const row = page.getByTestId('install-client-language')
  const select = row.getByRole('combobox')
  await expect(select).toHaveValue('ENU')
  await expect(select.locator('option')).toHaveText(['Français', 'English (US)'])
  await expect(row).toContainText('Français: 2 files of the English pack are missing')
  await expect(row).toContainText('Deutsch: incomplete pack (deu.pak or Data/Data.pak missing), not offered.')

  await select.selectOption('FRA')
  await expect(select).toHaveValue('FRA')
  await closeInstall(page)
  await startAll(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect.poll(() => existsSync(argsFile()), { timeout: 10_000 }).toBe(true)
  expect(JSON.parse(readFileSync(argsFile(), 'utf8'))).toContain('-lang:FRA')
  await stopAll(page)
  await app.close()

  // the choice is kept
  const again = await open()
  await again.page.getByTestId('install-summary').click()
  await expect(again.page.getByTestId('install-client-language').getByRole('combobox')).toHaveValue('FRA')
  await again.app.close()
})

test('refuses to start a client that lacks an engine file, and names it', async () => {
  const { app, page } = await open()
  await startAll(page)
  rmSync(join(install.clientRoot, 'bin64', 'Cry3DEngine.dll'))
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('alert')).toContainText('missing files it needs to start')
  expect(existsSync(argsFile())).toBe(false)

  await page.getByTestId('install-summary').click()
  await expect(page.getByTestId('install-client-missing')).toContainText('bin64/Cry3DEngine.dll')
  // put back, checked again: the refusal goes
  writeFileSync(join(install.clientRoot, 'bin64', 'Cry3DEngine.dll'), '')
  await page.getByTestId('install-check-client').click()
  await expect(page.getByTestId('install-client-missing')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await closeInstall(page)
  await stopAll(page)
  await app.close()
})

test('refuses to start a client without a complete language pack', async () => {
  rmSync(join(install.clientRoot, 'L10N', 'enu', 'enu.pak'))
  const { app, page } = await open()
  await page.getByTestId('install-summary').click()
  await expect(page.getByTestId('install-client-language')).toContainText('No complete language pack in L10N')
  await closeInstall(page)
  await startAll(page)
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('alert')).toContainText('no complete language pack')
  expect(existsSync(argsFile())).toBe(false)
  await stopAll(page)
  await app.close()
})

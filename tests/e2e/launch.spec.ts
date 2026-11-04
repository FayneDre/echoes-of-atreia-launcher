import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

let userDataDir: string

async function launch(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: ['.'],
    // No server folder: these tests are about the window, and must not find the server installed on this machine.
    env: { ...process.env, ECHOES_USER_DATA_DIR: userDataDir, AION_SERVER_HOME: '' }
  })
  const page = await app.firstWindow()
  return { app, page }
}

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'echoes-e2e-'))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

test('opens the launcher window', async () => {
  const { app, page } = await launch()
  await expect(page).toHaveTitle('Echoes of Atreia')
  await expect(page.getByRole('heading', { name: 'Echoes of Atreia' })).toBeVisible()
  await expect(page.getByText('NCSoft')).toBeVisible()
  await app.close()
})

test('opens in English the first time, whatever the system language', async () => {
  const { app, page } = await launch()
  await expect(page.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Atreia is never empty.')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await app.close()
})

test('switches between French and English', async () => {
  const { app, page } = await launch()

  await page.getByRole('button', { name: 'FR' }).click()
  await expect(page.getByText("Atreia n'est plus jamais vide.")).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

  await page.getByRole('button', { name: 'EN' }).click()
  await expect(page.getByText('Atreia is never empty.')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await app.close()
})

test('remembers the chosen language after a restart', async () => {
  const first = await launch()
  await first.page.getByRole('button', { name: 'FR' }).click()
  await first.app.close()

  const second = await launch()
  await expect(second.page.getByRole('button', { name: 'FR' })).toHaveAttribute('aria-pressed', 'true')
  await expect(second.page.getByText("Atreia n'est plus jamais vide.")).toBeVisible()
  await second.app.close()
})

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

// MySQL run as a program with the person's own my.ini, for a Windows service that does not start: a fake mysqld plays it, and a fake
// mysqladmin stops it. The real MySQL service of the machine is only looked at, never started or stopped.
let install: FakeInstall
let optionsFile: string

test.beforeEach(async () => {
  install = await createFakeInstall({ mysqlUp: false })
  optionsFile = join(install.root, 'MySQL Server', 'my.ini')
  mkdirSync(join(optionsFile, '..'), { recursive: true })
  writeFileSync(optionsFile, '[mysqld]\nport=3306\n')
  mkdirSync(install.userData, { recursive: true })
  writeFileSync(join(install.userData, 'settings.json'), JSON.stringify({ mysqlOptionsFile: optionsFile }))
})

test.afterEach(async () => {
  // A fake mysqld a failed test left running stops on this marker.
  writeFileSync(join(install.root, 'mysql-data', 'mysqld-shutdown'), '')
  await install.dispose()
})

const mysqlRow = (page: Page) => page.getByTestId('server-mysql')
const mysqlStatus = (page: Page) => page.getByTestId('status-mysql')

test('starts MySQL with the chosen my.ini on the servers’ port, and stops it through mysqladmin', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'stopped')
  // how MySQL is run opens over the page, the row keeps its one line
  await mysqlRow(page).getByRole('button', { name: 'How MySQL is run' }).click()
  const dialog = page.getByTestId('mysql-dialog')
  await expect(dialog).toContainText(optionsFile)
  await expect(dialog.getByRole('button', { name: 'Start with my own my.ini…' })).toBeEnabled()
  // a click in the dialog's own padding leaves it open, a click beside it closes it
  await dialog.click({ position: { x: 4, y: 4 } })
  await expect(dialog).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(dialog).toHaveCount(0)

  await mysqlRow(page).getByRole('button', { name: 'Start', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })
  const args = JSON.parse(readFileSync(join(install.root, 'mysql-data', 'mysqld-args.json'), 'utf8')) as string[]
  // no second mysqld, the one that would open a console window
  expect(args).toEqual([`--defaults-file=${optionsFile}`, `--port=${install.ports.mysql}`, '--no-monitor'])

  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'stopped', { timeout: 20_000 })
  await app.close()
})

test('says why MySQL would not shut down, and leaves it running', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await mysqlRow(page).getByRole('button', { name: 'Start', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })

  const refuse = join(install.root, 'mysql-data', 'refuse-shutdown')
  writeFileSync(refuse, '')
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(mysqlRow(page).getByRole('alert')).toContainText('SHUTDOWN privilege')
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'ready')
  // the banner's dialog says it too, over the page
  const refusal = page.getByTestId('problem-dialog').filter({ visible: true })
  await expect(refusal).toContainText('SHUTDOWN privilege')
  await refusal.getByRole('button', { name: 'Close' }).click()

  rmSync(refuse)
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'stopped', { timeout: 20_000 })
  expect(existsSync(join(install.root, 'mysql-data', 'mysqld-shutdown'))).toBe(false)
  await app.close()
})

test('says MySQL is stopped when it went away behind the launcher, and never shows it ready on a failed stop', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await mysqlRow(page).getByRole('button', { name: 'Start', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })

  // stopped from elsewhere (a script, a crash): the row still says ready until the person acts on it
  const marker = join(install.root, 'mysql-data', 'mysqld-shutdown')
  writeFileSync(marker, '')
  await expect.poll(() => existsSync(marker), { timeout: 20_000 }).toBe(false)
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'stopped', { timeout: 20_000 })
  await expect(mysqlRow(page).getByRole('alert')).toHaveCount(0)
  await app.close()
})

test('shows a refused action of the banner in a dialog, never as a line that grows the page', async () => {
  // the whole stack started and stopped
  test.setTimeout(90_000)
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  const hero = page.getByTestId('hero')
  const height = (await hero.boundingBox())!.height
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  const dialog = page.getByTestId('problem-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Stop the servers before MySQL')
  expect((await hero.boundingBox())!.height).toBe(height)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  // the same refusal again is shown again
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  // the servers stopped, MySQL stops: nothing refused any more
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'stopped', { timeout: 20_000 })
  await expect(page.getByTestId('problem-dialog')).toBeHidden()
  await app.close()
})

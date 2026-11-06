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
  await expect(mysqlRow(page)).toContainText(optionsFile)

  await mysqlRow(page).getByRole('button', { name: 'Start', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })
  const args = JSON.parse(readFileSync(join(install.root, 'mysql-data', 'mysqld-args.json'), 'utf8')) as string[]
  expect(args).toEqual([`--defaults-file=${optionsFile}`, `--port=${install.ports.mysql}`])

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

  rmSync(refuse)
  await mysqlRow(page).getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(mysqlStatus(page)).toHaveAttribute('data-status', 'stopped', { timeout: 20_000 })
  expect(existsSync(join(install.root, 'mysql-data', 'mysqld-shutdown'))).toBe(false)
  await app.close()
})

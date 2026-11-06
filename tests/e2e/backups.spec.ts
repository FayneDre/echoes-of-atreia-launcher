import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

const data = (database: string): string => readFileSync(join(install.root, 'mysql-data', `${database}.sql`), 'utf8')
const backupsDir = (): string => join(install.serverRoot, 'backups')
// Only this launcher's: the files carry its process id, and the other tests running at the same time make and remove their own.
const optionFilesLeft = (app: ElectronApplication): string[] =>
  readdirSync(tmpdir()).filter((name) => name.startsWith(`echoes-mysql-${app.process().pid}-`))

async function openBackups(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await launchWith(install)
  await launched.page.getByRole('button', { name: 'EN' }).click()
  await launched.page.getByRole('button', { name: 'Backups', exact: true }).click()
  await expect(launched.page.getByRole('button', { name: 'Back up now' })).toBeEnabled()
  return launched
}

async function backUp(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back up now' }).click()
  await expect(page.getByText('Backup made.')).toBeVisible()
}

test('backs up both databases, with the credentials each server uses, and lists the backup', async () => {
  const { app, page } = await openBackups()
  await expect(page.getByText('No backup yet.')).toBeVisible()
  await backUp(page)

  const [id] = readdirSync(backupsDir())
  expect(readFileSync(join(backupsDir(), id!, 'aion_ls.sql'), 'utf8')).toBe('-- fake dump of aion_ls\naccounts v1\n')
  expect(readFileSync(join(backupsDir(), id!, 'aion_gs.sql'), 'utf8')).toBe('-- fake dump of aion_gs\ncharacters v1\n')
  const row = page.getByTestId(`backup-${id}`)
  await expect(row).toContainText('Backup')
  await expect(row).toContainText('aion_ls 1 KB · aion_gs 1 KB')
  // The credentials went through a file of their own, removed after: none is left behind.
  expect(optionFilesLeft(app)).toEqual([])
  await app.close()
})

test('restores a backup, after backing up what was there', async () => {
  const { app, page } = await openBackups()
  await backUp(page)
  const [first] = readdirSync(backupsDir())

  writeFileSync(join(install.root, 'mysql-data', 'aion_gs.sql'), 'characters v2\n')
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId(`backup-${first}`).getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByText('Backup restored.')).toBeVisible()

  expect(data('aion_gs')).toBe('characters v1\n')
  expect(data('aion_ls')).toBe('accounts v1\n')
  const safety = readdirSync(backupsDir()).find((id) => id !== first)!
  expect(readFileSync(join(backupsDir(), safety, 'aion_gs.sql'), 'utf8')).toContain('characters v2')
  await expect(page.getByTestId(`backup-${safety}`)).toContainText('Before a restore')
  await app.close()
})

test('does not restore while the servers run', async () => {
  const { app, page } = await openBackups()
  await backUp(page)
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })

  await page.getByRole('button', { name: 'Backups', exact: true }).click()
  await expect(page.getByText('Stop the servers to restore a backup.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore' })).toBeDisabled()
  // A backup is still possible.
  await expect(page.getByRole('button', { name: 'Back up now' })).toBeEnabled()

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await app.close()
})

test('says why a backup failed, and leaves no half backup behind', async () => {
  rmSync(join(install.root, 'mysql-data', 'aion_gs.sql'))
  const { app, page } = await openBackups()
  await page.getByRole('button', { name: 'Back up now' }).click()
  const problem = page.getByRole('alert')
  await expect(problem).toContainText('The backup failed.')
  await expect(problem).toContainText("Unknown database 'aion_gs'")
  expect(existsSync(backupsDir()) ? readdirSync(backupsDir()) : []).toEqual([])
  await app.close()
})

test('survives a restore that fails half-way, and says what holds the data from before', async () => {
  // A dump big enough that mysql stops while the launcher is still sending it.
  writeFileSync(join(install.root, 'mysql-data', 'aion_ls.sql'), 'x'.repeat(8 * 1024 * 1024))
  const { app, page } = await openBackups()
  await backUp(page)
  const [first] = readdirSync(backupsDir())
  writeFileSync(join(install.root, 'mysql-data', 'fail-restore'), '')

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId(`backup-${first}`).getByRole('button', { name: 'Restore' }).click()
  const problem = page.getByRole('alert')
  await expect(problem).toContainText('The restore failed.')
  await expect(problem).toContainText('You have an error in your SQL syntax')
  await expect(problem).toContainText('holds what was there before')
  // Still standing, and still answering.
  await expect(page.getByRole('button', { name: 'Back up now' })).toBeEnabled()
  await app.close()
})

test('restores nothing from a backup whose description names a file outside it', async () => {
  const { app, page } = await openBackups()
  await backUp(page)
  const [id] = readdirSync(backupsDir())
  const metaFile = join(backupsDir(), id!, 'backup.json')
  const meta = JSON.parse(readFileSync(metaFile, 'utf8'))
  meta.databases[0].file = '../../outside.sql'
  writeFileSync(metaFile, JSON.stringify(meta))

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId(`backup-${id}`).getByRole('button', { name: 'Restore' }).click()
  await expect(page.getByRole('alert')).toContainText('is not a dump file name')
  // Refused before anything was touched: no safety backup either.
  expect(readdirSync(backupsDir())).toEqual([id])
  await app.close()
})

test('deletes a backup', async () => {
  const { app, page } = await openBackups()
  await backUp(page)
  const [id] = readdirSync(backupsDir())
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByTestId(`backup-${id}`).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText('No backup yet.')).toBeVisible()
  expect(readdirSync(backupsDir())).toEqual([])
  await app.close()
})

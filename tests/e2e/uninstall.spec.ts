import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import electronPath from 'electron'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

// A server the launcher installed from nothing: its marker, and its own MySQL (a my.ini beside a mysqld, which the fake mysqld plays). The
// last backup is kept in a folder of the test's own, never the person's Documents.
let install: FakeInstall
let kept: string

test.beforeEach(async () => {
  install = await createFakeInstall({ mysqlUp: false })
  kept = join(install.root, 'kept-backups')
  const mysql = join(install.serverRoot, 'mysql')
  mkdirSync(join(mysql, 'bin'), { recursive: true })
  writeFileSync(join(mysql, 'bin', 'mysqld.exe'), '')
  writeFileSync(join(mysql, 'my.ini'), '[mysqld]\nport=3307\n')
})

test.afterEach(async () => {
  // A fake mysqld a failed test left running stops on this marker.
  writeFileSync(join(install.root, 'mysql-data', 'mysqld-shutdown'), '')
  await install.dispose()
})

function markAsLauncherInstall(): void {
  const marker = { installedBy: 'echoes-of-atreia-launcher', folder: resolve(install.serverRoot), installedAt: new Date().toISOString() }
  writeFileSync(join(install.serverRoot, 'echoes-install.json'), JSON.stringify(marker))
}

/** The one backup kept outside, and what it holds: the databases as they were. */
function keptBackup(): { kind: string; characters: string; accounts: string } {
  const ids = readdirSync(kept)
  expect(ids).toHaveLength(1)
  const dir = join(kept, ids[0]!)
  const meta = JSON.parse(readFileSync(join(dir, 'backup.json'), 'utf8')) as { kind: string }
  return { kind: meta.kind, characters: readFileSync(join(dir, 'aion_gs.sql'), 'utf8'), accounts: readFileSync(join(dir, 'aion_ls.sql'), 'utf8') }
}

test('uninstalls a server it installed: the servers stopped, a last backup kept outside, the folder deleted and forgotten', async () => {
  test.setTimeout(90_000)
  markAsLauncherInstall()
  const { app, page } = await launchWith(install, { ECHOES_KEPT_BACKUPS_DIR: kept })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })

  await page.getByTestId('install-summary').click()
  const row = page.getByTestId('install-uninstall')
  await expect(row).toContainText('keeps a backup of your accounts and characters')
  // read in full before the button: wrapped, never cut with "..."
  const hint = row.locator('.install-value')
  expect(await hint.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
  let question = ''
  page.once('dialog', (dialog) => {
    question = dialog.message()
    void dialog.accept()
  })
  await row.getByRole('button', { name: 'Uninstall the server…' }).click()
  await expect(page.getByText('The server is uninstalled.')).toBeVisible({ timeout: 60_000 })
  expect(question).toContain(install.serverRoot)

  expect(existsSync(install.serverRoot)).toBe(false)
  const backup = keptBackup()
  expect(backup.kind).toBe('before-uninstall')
  expect(backup.characters).toContain('characters v1')
  expect(backup.accounts).toContain('accounts v1')
  // MySQL was shut down before its folder went
  expect(existsSync(join(install.root, 'mysql-data', 'mysqld-shutdown'))).toBe(false)
  const settings = JSON.parse(readFileSync(join(install.userData, 'settings.json'), 'utf8')) as Record<string, unknown>
  expect(settings['serverRoot']).toBeUndefined()
  // nothing is left to run: the home page offers to install a server again
  await expect(page.getByTestId('server-setup')).toBeVisible()
  await app.close()
})

test('never offers to uninstall a server it did not install', async () => {
  const { app, page } = await launchWith(install, { ECHOES_KEPT_BACKUPS_DIR: kept })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByTestId('install-summary').click()
  await expect(page.getByTestId('install-dialog')).toBeVisible()
  await expect(page.getByTestId('install-uninstall')).toHaveCount(0)
  await app.close()
  expect(existsSync(install.serverRoot)).toBe(true)
})

/** The launcher as its uninstaller runs it: no window, the question answered by the test, and it ends by itself. */
function runAsUninstaller(answer: 'yes' | 'no'): number | null {
  const result = spawnSync(electronPath as unknown as string, ['.', '--uninstall-server'], {
    env: {
      ...process.env,
      ECHOES_USER_DATA_DIR: install.userData,
      AION_SERVER_HOME: install.serverRoot,
      ECHOES_FAKE_JAVA: resolve('tests/fixtures/fake-java.mjs'),
      ECHOES_FAKE_DB: install.database,
      ECHOES_FAKE_MYSQL_TOOLS: resolve('tests/fixtures/mysql-tools'),
      ECHOES_FAKE_MYSQLD: resolve('tests/fixtures/fake-mysqld.mjs'),
      ECHOES_FAKE_MYSQL_DATA: join(install.root, 'mysql-data'),
      ECHOES_SERVER_FEED: 'http://127.0.0.1:9',
      ECHOES_NEWS_FEED: 'http://127.0.0.1:9',
      ECHOES_DEVELOPER_DEFAULT: 'off',
      ECHOES_KEPT_BACKUPS_DIR: kept,
      ECHOES_FAKE_UNINSTALL_ANSWER: answer
    },
    timeout: 60_000
  })
  return result.status
}

test('from its uninstaller, removes the server it installed once the person said yes', async () => {
  test.setTimeout(90_000)
  markAsLauncherInstall()
  expect(runAsUninstaller('yes')).toBe(0)
  expect(existsSync(install.serverRoot)).toBe(false)
  expect(keptBackup().characters).toContain('characters v1')
})

test('from its uninstaller, keeps the server when the person said no, and leaves one it did not install alone', async () => {
  test.setTimeout(90_000)
  markAsLauncherInstall()
  expect(runAsUninstaller('no')).toBe(0)
  expect(existsSync(join(install.serverRoot, 'game-server'))).toBe(true)
  expect(existsSync(kept)).toBe(false)

  writeFileSync(join(install.serverRoot, 'echoes-install.json'), '{}')
  expect(runAsUninstaller('yes')).toBe(0)
  expect(existsSync(join(install.serverRoot, 'game-server'))).toBe(true)
  expect(existsSync(kept)).toBe(false)
})

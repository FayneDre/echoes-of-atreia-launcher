import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, relative } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'
import { ServerFeedServer } from './serverFeed'

test.use({ actionTimeout: 15_000 })
let install: FakeInstall
let feed: ServerFeedServer
/** The folder the person picks: it already holds a file, so the server goes into a new folder inside it. */
let games: string
let target: string

/**
 * The bundle's database script, as setup-mysql.ps1 is called: it writes the my.ini the launcher then finds, and says on which port it was
 * asked. While a flag file sits beside the install it fails as the real one can, half-way: its my.ini and data folder made already, and
 * the real one refuses to run again over them.
 */
const FAKE_SETUP_MYSQL = `param([string]$ServerRoot, [int]$Port)
$ini = Join-Path $ServerRoot 'mysql\\my.ini'
if (Test-Path $ini) { Write-Output "$ini exists already"; exit 1 }
Set-Content $ini "[mysqld]\`r\`nport=$Port"
if (Test-Path (Join-Path (Split-Path $ServerRoot -Parent) 'setup-fails.txt')) {
    New-Item -ItemType Directory (Join-Path $ServerRoot 'mysql\\data') | Out-Null
    Set-Content (Join-Path $ServerRoot 'mysql\\data\\mysql.ibd') 'half made'
    Write-Output 'the data folder could not be made'
    Write-Output 'At setup-mysql.ps1:131 char:5, as PowerShell says it, on lines of their own'
    exit 1
}
Add-Content (Join-Path $ServerRoot 'setup-calls.txt') "port=$Port"
`

/** Every file of a folder, by path from it with forward slashes. */
function filesOf(root: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name)
      files[relative(root, path).split('\\').join('/')] = readFileSync(path, 'utf8')
    }
  }
  return files
}

test.beforeEach(async () => {
  install = await createFakeInstall()
  feed = new ServerFeedServer(join(install.root, 'server-feed'))
  await feed.start()
  // the release carries the fake server as its bundle; then the server folder is gone: this machine has none
  await feed.publish({
    tag: 'v0.2.0-beta.1',
    files: { ...filesOf(install.serverRoot), 'tools/setup-mysql.ps1': FAKE_SETUP_MYSQL },
    navmesh: { 'game-server/data/navmesh/110010000.nav': { content: 'the map of Sanctum' } },
    runtimes: {
      java: { 'bin/java.exe': 'the runtime', 'lib/modules': 'its modules' },
      mysql: { 'bin/mysqld.exe': 'the database', 'share/english/errmsg.sys': 'its messages' }
    }
  })
  rmSync(install.serverRoot, { recursive: true, force: true })
  games = join(install.root, 'Games')
  mkdirSync(games)
  writeFileSync(join(games, 'readme.txt'), 'the person’s own file')
  target = join(games, 'echoes-server')
})

test.afterEach(async () => {
  await feed.stop()
  await install.dispose()
})

/** The folder dialog answers with this folder, as if the person had picked it. */
async function pickFolder(app: ElectronApplication, folder: string): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as typeof dialog.showOpenDialog
  }, folder)
}

async function open(): ReturnType<typeof launchWith> {
  const launched = await launchWith(install, { ECHOES_SERVER_FEED: feed.url })
  await launched.page.getByRole('button', { name: 'EN', exact: true }).click()
  return launched
}

const bundleRequests = (): number => feed.requests.filter((path) => path.endsWith('.zip') && path.includes('aion-server-')).length

/** The panel's button opens what the install takes; the folder is chosen from there. */
async function startInstall(page: Page): Promise<void> {
  await page.getByTestId('server-setup').getByRole('button', { name: 'Install the server…' }).click()
  const dialog = page.getByTestId('server-setup-dialog')
  await expect(dialog).toContainText('About 2.1 GB is downloaded')
  await dialog.getByRole('button', { name: 'Choose the folder…' }).click()
}

/** How far the home page runs past the window: never more than nothing, whatever the install's state. */
const overflow = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scroller = document.querySelector('.page-scroll')!
    return scroller.scrollHeight - scroller.clientHeight
  })

test('installs the server from nothing into a folder of its own, and the launcher takes it as its server', async () => {
  const { app, page } = await open()
  const panel = page.getByTestId('server-setup')
  await expect(panel).toHaveAttribute('data-status', 'idle', { timeout: 20_000 })
  await expect(panel).toContainText('No server is installed yet')
  expect(await overflow(page), 'offered').toBeLessThanOrEqual(0)
  // no server: the home page alone, and no terminals to open
  const pages = page.locator('nav.nav button')
  await expect(pages.filter({ hasText: 'Home' })).toBeEnabled()
  for (const name of ['Account', 'Server settings', 'Bots', 'Backups']) {
    await expect(pages.filter({ hasText: name }), name).toBeDisabled()
  }
  await expect(page.getByTestId('terminals')).toHaveCount(0)
  await pickFolder(app, games)
  await startInstall(page)

  // done: the panel goes, the server is found where it was put, and every page opens
  await expect(panel).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('install-server')).toHaveAttribute('data-found', 'true')
  await expect(pages.filter({ hasText: 'Backups' })).toBeEnabled()
  await expect(page.getByTestId('terminals')).toBeVisible()
  expect(readFileSync(join(target, 'runtime', 'bin', 'java.exe'), 'utf8')).toBe('the runtime')
  expect(readFileSync(join(target, 'mysql', 'bin', 'mysqld.exe'), 'utf8')).toBe('the database')
  expect(readFileSync(join(target, 'game-server', 'data', 'navmesh', '110010000.nav'), 'utf8')).toBe('the map of Sanctum')
  expect(existsSync(join(target, 'game-server', 'start.bat'))).toBe(true)
  expect(JSON.parse(readFileSync(join(target, 'manifest.json'), 'utf8'))).toMatchObject({ source: 'release', version: 'v0.2.0-beta.1' })
  // the database made on a port from 3307, and nothing left behind
  expect(readFileSync(join(target, 'setup-calls.txt'), 'utf8')).toMatch(/^port=33\d\d/)
  expect(existsSync(join(target, 'update-staging'))).toBe(false)
  expect(existsSync(join(target, 'update-backups'))).toBe(false)
  // the person's own file is where it was
  expect(readFileSync(join(games, 'readme.txt'), 'utf8')).toBe('the person’s own file')
  // an install from nothing has nothing to undo
  await expect(page.getByTestId('server-update')).not.toContainText('Undo')
  // and it is the launcher's: its marker names the folder, so the installation's window offers to uninstall it
  expect(JSON.parse(readFileSync(join(target, 'echoes-install.json'), 'utf8'))).toMatchObject({ installedBy: 'echoes-of-atreia-launcher', folder: target })
  await page.getByTestId('install-summary').click()
  await expect(page.getByTestId('install-uninstall')).toBeVisible()
  await app.close()
})

test('a database that could not be made is tried again without downloading the server again', async () => {
  writeFileSync(join(games, 'setup-fails.txt'), '')
  const { app, page } = await open()
  const panel = page.getByTestId('server-setup')
  await expect(panel).toHaveAttribute('data-status', 'idle', { timeout: 20_000 })
  await pickFolder(app, games)
  await startInstall(page)

  await expect(panel).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
  await expect(page.getByTestId('server-setup-problem')).toContainText('The database could not be made.')
  await expect(page.getByTestId('server-setup-folder')).toContainText(target)
  // the failure is told in the dialog; closed, the page keeps one line of it and its height
  const dialog = page.getByTestId('server-setup-dialog')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(panel).toContainText('The server’s install did not finish.')
  expect(await overflow(page), 'failed').toBeLessThanOrEqual(0)
  await panel.getByRole('button', { name: 'See the install…' }).click()
  await expect(dialog.getByRole('button', { name: 'Details' })).toBeVisible()
  expect(bundleRequests()).toBe(1)
  expect(existsSync(join(target, 'setup-calls.txt'))).toBe(false)
  // what the script made before it failed is undone, so the next run starts from nothing as the real script requires
  expect(existsSync(join(target, 'mysql', 'my.ini'))).toBe(false)
  expect(existsSync(join(target, 'mysql', 'data'))).toBe(false)
  expect(existsSync(join(target, 'mysql', 'bin', 'mysqld.exe'))).toBe(true)

  rmSync(join(games, 'setup-fails.txt'))
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(panel).toBeHidden({ timeout: 30_000 })
  await expect(page.getByTestId('install-server')).toHaveAttribute('data-found', 'true')
  expect(existsSync(join(target, 'setup-calls.txt'))).toBe(true)
  // taken up at the database, in the same folder: the files were in place
  expect(bundleRequests()).toBe(1)
  expect(existsSync(join(target, 'echoes-server'))).toBe(false)
  await app.close()
})

test('a release that carries no Java and database is not installed from', async () => {
  // an older release, newer in number, published without its runtimes
  await feed.publish({ tag: 'v0.3.0-beta.1', files: { 'game-server/start.bat': 'x' } })
  const { app, page } = await open()
  const panel = page.getByTestId('server-setup')
  await expect(panel).toHaveAttribute('data-status', 'idle', { timeout: 20_000 })
  await pickFolder(app, games)
  await startInstall(page)
  await expect(panel).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
  await expect(page.getByTestId('server-setup-problem')).toContainText('No server release carries what an install needs yet')
  expect(existsSync(join(target, 'game-server'))).toBe(false)
  await app.close()
})

test('the install offered and the news side by side fit the window', async () => {
  // the launcher's news with a long summary: beside the install panel, the column once ran 15 px past the window
  const news = createServer((request, response) => {
    const base = `http://127.0.0.1:${(news.address() as AddressInfo).port}`
    if (request.url === '/launcher.json') {
      response.end(
        JSON.stringify([
          {
            tag_name: 'v0.4.0-beta.1',
            html_url: 'https://example.invalid/v0.4.0-beta.1',
            published_at: '2026-11-15T10:00:00Z',
            draft: false,
            prerelease: true,
            body: '',
            assets: [{ name: 'notes.en.md', browser_download_url: `${base}/notes` }]
          }
        ])
      )
    } else if (request.url === '/notes') {
      response.end('**Offered by the launcher** with `Echoes-of-Atreia-Setup-0.4.0-beta.1.exe`.' + ' A long sentence about the launcher.'.repeat(20))
    } else {
      response.end('[]')
    }
  })
  await new Promise<void>((resolve) => news.listen(0, '127.0.0.1', resolve))
  try {
    const { app, page } = await launchWith(install, {
      ECHOES_SERVER_FEED: feed.url,
      ECHOES_NEWS_FEED: `http://127.0.0.1:${(news.address() as AddressInfo).port}`
    })
    await page.getByRole('button', { name: 'EN', exact: true }).click()
    await expect(page.getByTestId('server-setup')).toHaveAttribute('data-status', 'idle', { timeout: 20_000 })
    await expect(page.getByTestId('news-launcher-v0.4.0-beta.1')).toBeVisible()
    expect(await overflow(page), 'offered, with the news').toBeLessThanOrEqual(0)
    await app.close()
  } finally {
    news.closeAllConnections()
    await new Promise((resolve) => news.close(resolve))
  }
})

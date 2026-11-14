import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

// A release as GitHub serves its assets, on a local server: latest.yml naming the installer and its hash, the installer, the notes.
let install: FakeInstall
let server: Server
let feedDir: string
let feedUrl: string
let cacheDirName: string

const current = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

function publish(version: string): void {
  const installer = `Echoes-of-Atreia-Setup-${version}.exe`
  const bytes = Buffer.from(`fake installer ${version}`)
  writeFileSync(join(feedDir, installer), bytes)
  const sha512 = createHash('sha512').update(bytes).digest('base64')
  writeFileSync(
    join(feedDir, 'latest.yml'),
    `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: ${sha512}\n    size: ${bytes.length}\npath: ${installer}\nsha512: ${sha512}\nreleaseDate: '2026-11-06T00:00:00.000Z'\n`
  )
  writeFileSync(join(feedDir, 'notes.en.md'), `What changes in ${version}`)
  writeFileSync(join(feedDir, 'notes.fr.md'), `Ce qui change dans ${version}`)
}

test.beforeEach(async () => {
  install = await createFakeInstall()
  feedDir = join(install.root, 'feed')
  mkdirSync(feedDir)
  server = createServer((request, response) => {
    try {
      response.end(readFileSync(join(feedDir, decodeURIComponent((request.url ?? '/').split('?')[0]!.slice(1)))))
    } catch {
      response.statusCode = 404
      response.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  feedUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  cacheDirName = `echoes-test-updater-${process.pid}-${Date.now()}`
})

test.afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  // the download lands in the system's cache folder, under the name the config gives
  rmSync(join(process.env['LOCALAPPDATA'] ?? install.root, cacheDirName), { recursive: true, force: true })
  await install.dispose()
})

async function open(): ReturnType<typeof launchWith> {
  const config = join(install.root, 'app-update.yml')
  writeFileSync(config, `provider: generic\nurl: ${feedUrl}\nupdaterCacheDirName: ${cacheDirName}\n`)
  const launched = await launchWith(install, { ECHOES_UPDATE_FEED: feedUrl, ECHOES_UPDATE_CONFIG: config })
  await launched.page.getByRole('button', { name: 'EN', exact: true }).click()
  return launched
}

test('offers a newer version, downloads it only once accepted, then offers to install it', async () => {
  publish('9.9.9-beta.1')
  const { app, page } = await open()
  const banner = page.getByTestId('launcher-update')
  await expect(banner).toHaveAttribute('data-status', 'available', { timeout: 20_000 })
  await expect(banner).toContainText('Version 9.9.9-beta.1 of the launcher is out')
  // nothing is downloaded until the person accepts
  await page.waitForTimeout(2_000)
  await expect(banner).toHaveAttribute('data-status', 'available')
  // the notes open over the page, the banner keeps its line
  const height = (await banner.boundingBox())!.height
  await banner.getByRole('button', { name: 'What’s new' }).click()
  const dialog = page.getByTestId('launcher-update-dialog')
  await expect(dialog.getByTestId('launcher-update-notes')).toHaveText('What changes in 9.9.9-beta.1')
  expect((await banner.boundingBox())!.height).toBe(height)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
  await banner.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(banner).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })
  await expect(banner).toContainText('Version 9.9.9-beta.1 of the launcher is downloaded')
  await expect(banner.getByRole('button', { name: 'Restart and install' })).toBeEnabled()
  await page.getByRole('button', { name: 'FR', exact: true }).click()
  await banner.getByRole('button', { name: 'Quoi de neuf' }).click()
  await expect(page.getByTestId('launcher-update-notes')).toHaveText('Ce qui change dans 9.9.9-beta.1')
  await app.close()
})

test('says when the download failed, and offers it again', async () => {
  publish('9.9.9-beta.1')
  const { app, page } = await open()
  const banner = page.getByTestId('launcher-update')
  await expect(banner).toHaveAttribute('data-status', 'available', { timeout: 20_000 })
  // the installer is gone from the release: the download fails
  rmSync(join(feedDir, 'Echoes-of-Atreia-Setup-9.9.9-beta.1.exe'))
  await banner.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(banner).toContainText('The download of version 9.9.9-beta.1 of the launcher failed', { timeout: 20_000 })
  await expect(banner).toHaveAttribute('data-status', 'available')
  publish('9.9.9-beta.1')
  await banner.getByRole('button', { name: 'Try again' }).click()
  await expect(banner).toHaveAttribute('data-status', 'ready', { timeout: 20_000 })
  await app.close()
})

test('puts the offer away until the next start when asked later', async () => {
  publish('9.9.9-beta.1')
  const { app, page } = await open()
  const banner = page.getByTestId('launcher-update')
  await expect(banner).toHaveAttribute('data-status', 'available', { timeout: 20_000 })
  await banner.getByRole('button', { name: 'Later' }).click()
  await expect(banner).toHaveCount(0)
  await app.close()
})

test('says nothing when the release is the version it runs', async () => {
  publish(current)
  const { app, page } = await open()
  await expect(page.getByTestId('status-game')).toBeVisible()
  // the check is made at start, and answers within a second from a local server
  await page.waitForTimeout(3_000)
  await expect(page.getByTestId('launcher-update')).toHaveCount(0)
  await app.close()
})

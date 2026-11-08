import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFakeInstall, launchWith } from '../e2e/fakeInstall'

/**
 * Takes the pictures of README.md into docs/images/, in English, at the size the pages are drawn for. The fake install holds made-up accounts,
 * characters and bots, so nothing of a real player shows; its fake servers are started, so the home page shows a running server. The news come
 * from a local feed: the launcher's own latest entry of docs/release-notes, and a summary of a server release.
 */

const repoDir = resolve(__dirname, '..', '..')
const images = join(repoDir, 'docs', 'images')

/** The newest entry of the launcher's English notes, without its heading. */
function latestLauncherNotes(): { tag: string; notes: string } {
  const text = readFileSync(join(repoDir, 'docs', 'release-notes', 'current.en.md'), 'utf8').replace(/\r\n/g, '\n')
  const match = /^## (v\S+)[^\n]*\n([\s\S]*?)(?=\n---|\n## |(?![\s\S]))/m.exec(text)
  if (!match) throw new Error('docs/release-notes/current.en.md has no entry')
  return { tag: match[1]!, notes: match[2]!.trim() }
}

const SERVER_NOTES =
  "**The combat meter**: the server counts each player's damage and healing, by skill, and the bots' while they are in a player's group; " +
  'the in-game addon shows it, served on port 7790.'

/** GitHub's release listings as the launcher reads them, for the news panel and the server version. */
function startFeed(): Promise<Server> {
  const launcher = latestLauncherNotes()
  const feed = createServer((request, response) => {
    const base = `http://127.0.0.1:${(feed.address() as AddressInfo).port}`
    const release = (tag: string, date: string) => ({
      tag_name: tag,
      html_url: `https://example.invalid/${tag}`,
      published_at: date,
      draft: false,
      prerelease: true,
      body: '',
      assets: [{ name: 'notes.en.md', browser_download_url: `${base}/notes/${tag}` }]
    })
    const path = request.url ?? ''
    if (path === '/launcher.json') {
      response.end(JSON.stringify([release(launcher.tag, '2026-11-07T18:00:00Z')]))
    } else if (path === '/server.json') {
      response.end(JSON.stringify([release('v0.1.0-beta.4', '2026-11-08T15:00:00Z')]))
    } else if (path === '/releases.json') {
      response.end('[]')
    } else if (path === `/notes/${launcher.tag}`) {
      response.end(launcher.notes)
    } else if (path === '/notes/v0.1.0-beta.4') {
      response.end(SERVER_NOTES)
    } else {
      response.statusCode = 404
      response.end()
    }
  })
  return new Promise((done) => feed.listen(0, '127.0.0.1', () => done(feed)))
}

async function shoot(page: Page, name: string): Promise<void> {
  // the page has drawn what it fetched, and no hover is left on a button
  await page.mouse.move(0, 0)
  await page.waitForTimeout(800)
  await page.screenshot({ path: join(images, `${name}.png`) })
}

async function open(page: Page, name: string): Promise<void> {
  await page.locator('nav.nav button').filter({ hasText: name }).click()
}

test('the README pictures', async () => {
  const install = await createFakeInstall()
  const feed = await startFeed()
  const feedUrl = `http://127.0.0.1:${(feed.address() as AddressInfo).port}`
  try {
    const { app, page } = await launchWith(install, { ECHOES_NEWS_FEED: feedUrl, ECHOES_SERVER_FEED: feedUrl })
    await page.getByRole('button', { name: 'EN', exact: true }).click()

    await open(page, 'Account')
    await page.getByLabel('Account name').fill('player1')
    await page.getByLabel('Password').fill('secret')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByTestId('character-Aeris').click()
    await expect(page.getByTestId('playing')).toContainText('Aeris')

    await open(page, 'Backups')
    await page.getByRole('button', { name: 'Back up now' }).click()
    await expect(page.getByText('Backup made.')).toBeVisible()

    await open(page, 'Home')
    await page.getByRole('button', { name: 'Start the servers' }).click()
    await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready')
    await expect(page.getByTestId(`news-launcher-${latestLauncherNotes().tag}`)).toBeVisible()
    await expect(page.getByTestId('news-summary')).not.toBeEmpty()
    await shoot(page, 'home')
    await open(page, 'Account')
    await shoot(page, 'account')
    await open(page, 'Server settings')
    await shoot(page, 'server-settings')
    await open(page, 'Bots')
    await shoot(page, 'bots')
    await open(page, 'Backups')
    await shoot(page, 'backups')

    await open(page, 'Home')
    await page.getByRole('button', { name: 'Stop the servers' }).click()
    // all three stopped, or closing the launcher waits on the ones still stopping
    for (const id of ['game', 'login', 'chat']) {
      await expect(page.getByTestId(`status-${id}`)).toHaveAttribute('data-status', 'stopped')
    }
    await app.close()
  } finally {
    // the launcher keeps its connections alive: closed first, or close() waits for them
    feed.closeAllConnections()
    await new Promise((done) => feed.close(done))
    await install.dispose()
  }
})

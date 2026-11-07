import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

let install: FakeInstall
let feed: Server
let feedUrl: string

const release = (tag: string, date: string, prerelease: boolean, notes: Record<string, string>, base: string) => ({
  tag_name: tag,
  html_url: `https://example.invalid/${tag}`,
  published_at: date,
  draft: false,
  prerelease,
  body: 'the body',
  assets: Object.keys(notes).map((language) => ({ name: `notes.${language}.md`, browser_download_url: `${base}/notes/${tag}/${language}` }))
})

test.beforeEach(async () => {
  install = await createFakeInstall()
  const notes: Record<string, string> = {
    'v0.4.0-beta.1/en': '**Bold launcher news**\n\n- one change',
    'v0.4.0-beta.1/fr': '**Nouveautés du launcher**\n\n- un changement',
    // a summary longer than the launcher's: the panel must not change height from one tab to the other
    'v0.2.0-beta.1/en': 'Server news in English.' + ' A long sentence about the server.'.repeat(30)
  }
  feed = createServer((request, response) => {
    const base = `http://127.0.0.1:${(feed.address() as AddressInfo).port}`
    const path = request.url ?? ''
    if (path === '/launcher.json') {
      response.end(JSON.stringify([release('v0.4.0-beta.1', '2026-11-07T10:00:00Z', true, { en: '', fr: '' }, base), release('v0.3.0', '2026-11-01T10:00:00Z', false, {}, base)]))
    } else if (path === '/server.json') {
      response.end(JSON.stringify([release('v0.2.0-beta.1', '2026-11-06T10:00:00Z', true, { en: '' }, base)]))
    } else if (path.startsWith('/notes/') && notes[path.slice('/notes/'.length)] !== undefined) {
      response.end(notes[path.slice('/notes/'.length)])
    } else {
      response.statusCode = 404
      response.end()
    }
  })
  await new Promise<void>((resolve) => feed.listen(0, '127.0.0.1', resolve))
  feedUrl = `http://127.0.0.1:${(feed.address() as AddressInfo).port}`
})

test.afterEach(async () => {
  await new Promise((resolve) => feed.close(resolve))
  await install.dispose()
})

test('shows where the stack stands, the news of both projects, the install folded, and the versions', async () => {
  const { app, page } = await launchWith(install, { ECHOES_NEWS_FEED: feedUrl })
  await page.getByRole('button', { name: 'EN', exact: true }).click()

  await expect(page.getByTestId('hero')).toContainText('Servers stopped')
  await expect(page.getByTestId('hero-bots')).toHaveText('—')
  await expect(page.getByTestId('footer-versions')).toContainText('Launcher 0.')

  // every check passed: the install is one line, unfolded on a click
  await expect(page.getByTestId('install-server')).toBeHidden()
  const summary = page.getByTestId('install-summary')
  await expect(summary).toHaveAttribute('aria-expanded', 'false')
  await summary.click()
  await expect(page.getByTestId('install-server')).toBeVisible()

  const news = page.getByTestId('news')
  // the newest release with the first paragraph of its notes, drawn as Markdown in the person's language; the list stays out of it
  const latest = news.getByTestId('news-launcher-v0.4.0-beta.1')
  await expect(latest.locator('strong')).toHaveText('Bold launcher news')
  await expect(latest).not.toContainText('one change')
  // the newest alone: the panel keeps its height however many releases come out
  await expect(news.getByTestId('news-launcher-v0.3.0')).toHaveCount(0)
  // the whole notes open over the page, and close on Escape
  await latest.getByRole('button', { name: 'Read the notes' }).click()
  const dialog = page.getByTestId('news-dialog')
  await expect(dialog).toContainText('one change')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  // the releases before are in the same dialog, the one before the newest picked; a release without notes files shows its body
  await latest.getByRole('button', { name: 'Previous versions (1)' }).click()
  await expect(dialog.getByRole('heading')).toHaveText('Launcher v0.3.0')
  await expect(dialog).toContainText('the body')
  await dialog.getByRole('button', { name: /v0\.4\.0-beta\.1/ }).click()
  await expect(dialog).toContainText('one change')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
  // the server's tab has not been opened yet
  await expect(news.getByRole('tab', { name: /Server/ })).toContainText('new')
  const height = async (): Promise<number> => (await news.boundingBox())!.height
  const launcherHeight = await height()
  await news.getByRole('tab', { name: /Server/ }).click()
  await expect(news.getByTestId('news-summary')).toContainText('Server news')
  expect(await height()).toBe(launcherHeight)
  await expect(news.getByTestId('news-server-v0.2.0-beta.1')).toContainText('Server news in English')
  await expect(news.getByRole('tab', { name: /Server/ })).not.toContainText('new')

  await page.getByRole('button', { name: 'FR', exact: true }).click()
  await news.getByRole('tab', { name: 'Launcher' }).click()
  await expect(news.getByTestId('news-launcher-v0.4.0-beta.1').locator('strong')).toHaveText('Nouveautés du launcher')
  await app.close()
})

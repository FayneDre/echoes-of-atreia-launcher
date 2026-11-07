import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

let install: FakeInstall
let feed: Server
let feedUrl: string
/** GitHub once the hour's questions are spent: the listings refused. */
let refusing = false
const conditional: string[] = []
let listingsAsked = 0

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
  refusing = false
  conditional.length = 0
  listingsAsked = 0
  const notes: Record<string, string> = {
    'v0.4.0-beta.1/en': '**Bold launcher news**\n\n- one change',
    'v0.4.0-beta.1/fr': '**Nouveautés du launcher**\n\n- un changement',
    // a summary longer than the launcher's: the panel must not change height from one tab to the other
    'v0.2.0-beta.1/en': 'Server news in English.' + ' A long sentence about the server.'.repeat(30)
  }
  feed = createServer((request, response) => {
    const base = `http://127.0.0.1:${(feed.address() as AddressInfo).port}`
    const path = request.url ?? ''
    if (path.endsWith('.json')) {
      listingsAsked++
      if (request.headers['if-none-match']) {
        conditional.push(path)
      }
      if (refusing) {
        response.statusCode = 403
        response.end('{"message":"API rate limit exceeded"}')
        return
      }
      response.setHeader('ETag', `"${path}"`)
    }
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

  // the install is one line of checks; its folders open in a dialog, so the page does not move
  await expect(page.getByTestId('install-server')).toBeHidden()
  const summary = page.getByTestId('install-summary')
  await expect(summary).toContainText('Change…')
  const installPanel = page.locator('.install-panel')
  const panelHeight = (await installPanel.boundingBox())!.height
  await summary.click()
  await expect(page.getByTestId('install-server')).toBeVisible()
  expect((await installPanel.boundingBox())!.height).toBe(panelHeight)
  await page.getByTestId('install-dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('install-server')).toBeHidden()
  // what the install takes, in the room the line leaves: the drive, the backups, the database as MySQL reports it
  await expect(page.getByTestId('install-disk')).toContainText(/^[A-Z]: [\d.,]+ (GB|MB) free$/)
  await expect(page.getByTestId('install-database')).toHaveText('19.4 MB · MySQL 8.4.3')
  await expect(page.getByTestId('install-backups')).toHaveText('None')
  await page.getByTestId('install-backups').getByRole('button').click()
  await expect(page.getByRole('button', { name: 'Backups', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  // the two columns end together
  const bottom = async (selector: string): Promise<number> => {
    const box = (await page.locator(selector).boundingBox())!
    return Math.round(box.y + box.height)
  }
  expect(await bottom('.install-panel')).toBe(await bottom('[data-testid=news]'))

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

test('asks at each start whether the news changed, and shows the news GitHub gave last when it refuses', async () => {
  // the launcher opened twice: past the default 30 s when the whole suite runs with little memory free
  test.setTimeout(90_000)
  const first = await launchWith(install, { ECHOES_NEWS_FEED: feedUrl })
  await first.page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(first.page.getByTestId('news-launcher-v0.4.0-beta.1')).toBeVisible()
  await first.app.close()

  // the hour's questions spent: what was read last is shown rather than an error
  refusing = true
  const second = await launchWith(install, { ECHOES_NEWS_FEED: feedUrl })
  const news = second.page.getByTestId('news')
  await expect(news.getByTestId('news-launcher-v0.4.0-beta.1').locator('strong')).toHaveText('Bold launcher news')
  await expect(news).not.toContainText('could not be read')
  // and the question carried the ETag kept, so an unchanged list is not downloaded again
  expect(conditional).toEqual(expect.arrayContaining(['/launcher.json', '/server.json']))
  await second.app.close()

  // relaunched at once: asked again all the same, what changed shows at start
  refusing = false
  const asked = listingsAsked
  const third = await launchWith(install, { ECHOES_NEWS_FEED: feedUrl })
  await expect(third.page.getByTestId('news-launcher-v0.4.0-beta.1')).toBeVisible()
  await expect.poll(() => listingsAsked).toBe(asked + 2)
  await third.app.close()
})

test('in the developer mode, reads the news from the repositories and asks GitHub nothing; off, asks GitHub', async () => {
  // the two repositories on this computer, with their notes
  const notes = (repository: string, folder: string, tag: string, french: string, english: string): string => {
    const dir = join(install.root, repository, ...folder.split('/'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'current.md'), `# Notes

---

## ${tag} — 07/11/2026

${french}
`)
    writeFileSync(join(dir, 'current.en.md'), `# Notes

---

## ${tag} — 2026-11-07

${english}
`)
    return join(install.root, repository)
  }
  const launcherRepository = notes('launcher-repo', 'docs/release-notes', 'v0.5.0-beta.1', 'Pas encore publiée', 'Not released yet')
  const serverRepository = notes('server-repo', 'docs/patch-notes', 'v0.3.0-beta.1', 'Serveur local', 'Local server')

  const { app, page } = await launchWith(install, {
    ECHOES_NEWS_FEED: feedUrl,
    // run from its sources, the launcher is in the developer mode unless told otherwise
    ECHOES_DEVELOPER_DEFAULT: '',
    ECHOES_LAUNCHER_REPO: launcherRepository,
    ECHOES_SERVER_REPO: serverRepository
  })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  const news = page.getByTestId('news')
  await expect(news.getByTestId('news-launcher-v0.5.0-beta.1')).toContainText('Not released yet')
  await news.getByRole('tab', { name: /Server/ }).click()
  await expect(news.getByTestId('news-server-v0.3.0-beta.1')).toContainText('Local server')
  await expect(page.getByTestId('server-update')).toHaveAttribute('data-status', 'developer')
  expect(listingsAsked).toBe(0)

  // the switch, in the install's dialog: off, GitHub is asked at once
  await page.getByTestId('install-summary').click()
  const developer = page.getByLabel(/Developer mode/)
  await expect(developer).toBeChecked()
  // the box follows the launcher's state, which the saved setting publishes: a click, then a wait (uncheck() would look at once)
  await developer.click()
  await expect(developer).not.toBeChecked()
  await page.getByTestId('install-dialog').getByRole('button', { name: 'Close' }).click()
  await news.getByRole('tab', { name: /Launcher/ }).click()
  await expect(news.getByTestId('news-launcher-v0.4.0-beta.1')).toBeVisible()
  await expect(page.getByTestId('server-update')).not.toHaveAttribute('data-status', 'developer')
  expect(listingsAsked).toBeGreaterThan(0)
  await app.close()
})


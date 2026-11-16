import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFakeInstall, FAKE_BOTS, launchWith, writeFakeDatabase, type FakeInstall } from './fakeInstall'

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

/** Every block of the page shown, its size and place: what must not move when the language changes. */
function blocks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main section')].map((element) => {
      const box = element.getBoundingClientRect()
      const name = element.getAttribute('data-testid') ?? element.className
      return `${name} ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.left)},${Math.round(box.top)}`
    })
  )
}

test('lays out every page the same in every language as in French', async () => {
  const { app, page } = await launchWith(install)
  // the detection done and the server's version read: the page no longer grows by itself
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await expect(page.getByTestId('server-update')).toBeVisible()
  await page.waitForTimeout(1_000)
  const languages = page.getByRole('group', { name: /Langue|Language/ }).getByRole('button')
  const codes = await languages.allTextContents()
  const pages = page.locator('nav.nav button')
  await expect(pages).toHaveCount(5)
  const layouts: Record<string, string[][]> = {}
  for (const code of ['FR', ...codes.filter((code) => code !== 'FR')]) {
    await languages.filter({ hasText: code }).click()
    layouts[code] = []
    for (let index = 0; index < (await pages.count()); index++) {
      await pages.nth(index).click()
      // the page has drawn what the launcher published
      await page.waitForTimeout(300)
      layouts[code].push(await blocks(page))
    }
  }
  for (const code of codes.filter((code) => code !== 'FR')) {
    expect(layouts[code], `${code} against FR`).toEqual(layouts['FR'])
  }
  await app.close()
})

test('shows the home page whole, without a scroll bar, at the first size, in a smaller window and in a larger one', async () => {
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await expect(page.getByTestId('server-update')).toBeVisible()
  await page.waitForTimeout(1_000)
  const overflow = () =>
    page.evaluate(() => {
      const scroller = document.querySelector('.page-scroll')!
      return scroller.scrollHeight - scroller.clientHeight
    })
  expect(await overflow(), 'at the first size').toBeLessThanOrEqual(0)
  // the window a clean-machine sandbox opened, 20 pixels short: the page shrinks instead of scrolling
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1160, 751))
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(0.95)
  await page.waitForTimeout(300)
  expect(await overflow(), 'smaller').toBeLessThanOrEqual(0)
  // a larger window zooms the page: the same layout, which must still fit
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1180 * 1.25, 780 * 1.25))
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(1.25)
  await page.waitForTimeout(300)
  expect(await overflow(), 'zoomed').toBeLessThanOrEqual(0)
  await app.close()
})

test('keeps the home page whole when MySQL is down and run with a my.ini of a long path', async () => {
  await install.dispose()
  install = await createFakeInstall({ mysqlUp: false })
  const optionsFile = join(install.root, 'a rather long folder name for a database', 'MySQL Server 8.4 portable', 'my.ini')
  mkdirSync(join(optionsFile, '..'), { recursive: true })
  writeFileSync(optionsFile, '[mysqld]\nport=3306\n')
  mkdirSync(install.userData, { recursive: true })
  writeFileSync(join(install.userData, 'settings.json'), JSON.stringify({ mysqlOptionsFile: optionsFile }))
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await expect(page.getByTestId('server-update')).toBeVisible()
  await page.waitForTimeout(1_000)
  // MySQL takes one line, as each server does
  const row = async (id: string): Promise<number> => (await page.getByTestId(`server-${id}`).boundingBox())!.height
  expect(await row('mysql')).toBe(await row('chat'))
  const overflow = () =>
    page.evaluate(() => {
      const scroller = document.querySelector('.page-scroll')!
      return scroller.scrollHeight - scroller.clientHeight
    })
  expect(await overflow(), 'at the first size').toBeLessThanOrEqual(0)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1180 * 1.25, 780 * 1.25))
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(1.25)
  await page.waitForTimeout(300)
  expect(await overflow(), 'zoomed').toBeLessThanOrEqual(0)
  await app.close()
})

test('offers to start MySQL with a my.ini on its own line when there is neither a service nor a my.ini', async () => {
  await install.dispose()
  install = await createFakeInstall({ mysqlUp: false })
  const { app, page } = await launchWith(install, { ECHOES_FAKE_NO_MYSQL_SERVICE: '1' })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  const row = page.getByTestId('server-mysql')
  await expect(page.getByTestId('status-mysql')).toHaveAttribute('data-status', 'missing')
  await expect(row.getByRole('button', { name: 'Start with my own my.ini…' })).toBeVisible()
  const height = async (id: string): Promise<number> => (await page.getByTestId(`server-${id}`).boundingBox())!.height
  expect(await height('mysql')).toBe(await height('chat'))
  await app.close()
})

test('ends both home columns on the same line, at the foot of the window, and spaces the options evenly', async () => {
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await expect(page.getByTestId('server-update')).toBeVisible()
  await page.waitForTimeout(1_000)
  const bottom = (selector: string) => page.locator(selector).evaluate((element) => Math.round(element.getBoundingClientRect().bottom))
  const installBottom = await bottom('.install-panel')
  expect(await bottom('[data-testid="news"]'), 'the news against the install panel').toBe(installBottom)
  // the room under the columns is the page's padding alone
  const scrollerBottom = await page.locator('.page-scroll').evaluate((element) => Math.round(element.getBoundingClientRect().bottom))
  expect(scrollerBottom - installBottom).toBeLessThanOrEqual(12)

  await page.getByTestId('install-summary').click()
  const gaps = await page.locator('.install-options').evaluate((list) => {
    const boxes = [...list.children].map((child) => child.getBoundingClientRect())
    return boxes.slice(1).map((box, index) => Math.round(box.top - boxes[index]!.bottom))
  })
  expect(new Set(gaps).size, `gaps between the options: ${gaps.join(', ')}`).toBe(1)
  await app.close()
})

test('opens the terminals over the home page, whose panels keep their size and place', async () => {
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await expect(page.getByTestId('server-update')).toBeVisible()
  await page.waitForTimeout(1_000)
  const panels = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('.home-grid section'), document.querySelector('.page-scroll')!].map((element) => {
        const box = element.getBoundingClientRect()
        return `${element.getAttribute('data-testid') ?? element.className} ${Math.round(box.width)}x${Math.round(box.height)} at ${Math.round(box.left)},${Math.round(box.top)}`
      })
    )
  // the terminals open once a server runs: nothing stopped has a console to read
  await page.getByRole('button', { name: 'FR', exact: true }).click()
  await page.getByRole('button', { name: 'Démarrer les serveurs' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 })
  const closed = await panels()
  await page.getByTestId('terminals-toggle').click()
  await expect(page.locator('.terminal')).toBeVisible()
  await page.waitForTimeout(300)
  expect(await panels()).toEqual(closed)
  // and it lies over them: the drawer's top is above the foot of the page
  const drawerTop = await page.getByTestId('terminals').evaluate((element) => element.getBoundingClientRect().top)
  const pageBottom = await page.locator('.page-scroll').evaluate((element) => element.getBoundingClientRect().bottom)
  expect(drawerTop).toBeLessThan(pageBottom)
  await page.getByRole('button', { name: 'Arrêter les serveurs' }).click()
  await expect(page.getByTestId('status-chat')).toHaveAttribute('data-status', 'stopped', { timeout: 30_000 })
  await app.close()
})

test('shows every page, every part and every settings group without a scroll bar at the first size, with many bots', async () => {
  writeFakeDatabase(
    install,
    undefined,
    undefined,
    Array.from({ length: 400 }, (_, index) => ({ ...FAKE_BOTS[index % 3]!, id: 920000 + index, name: `Bot${index}` }))
  )
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await page.waitForTimeout(1_000)
  // every element of the page shown that scrolls and has more than it shows
  const scrolling = (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('main.content:not([hidden]), main.content:not([hidden]) *')]
        .filter((element) => {
          const overflow = getComputedStyle(element).overflowY
          return (overflow === 'auto' || overflow === 'scroll') && element.scrollHeight > element.clientHeight + 1
        })
        .map((element) => `${element.className} ${element.scrollHeight}/${element.clientHeight}`)
    )
  const found: string[] = []
  const look = async (where: string): Promise<void> => {
    await page.waitForTimeout(300)
    found.push(...(await scrolling()).map((element) => `${where}: ${element}`))
  }
  const pages = page.locator('nav.nav button')
  for (let index = 0; index < (await pages.count()); index++) {
    await pages.nth(index).click()
    const name = (await pages.nth(index).textContent()) ?? ''
    const parts = page.locator('main.content:not([hidden]) .sub-tabs button')
    for (let part = 0; part < Math.max(1, await parts.count()); part++) {
      if (await parts.count()) {
        await parts.nth(part).click()
      }
      const groups = page.locator('main.content:not([hidden]) .sub-page:not([hidden]) .group-list button, main.content:not([hidden]) > .settings-page .group-list button')
      if ((await groups.count()) === 0) {
        await look(name)
      }
      for (let group = 0; group < (await groups.count()); group++) {
        await groups.nth(group).click()
        await look(`${name} / ${await groups.nth(group).textContent()}`)
      }
    }
  }
  expect(found).toEqual([])
  await app.close()
})

test('writes each official value on one line, the longest choice in French included', async () => {
  const { app, page } = await launchWith(install)
  await page.getByRole('button', { name: 'FR', exact: true }).click()
  await page.getByRole('button', { name: 'Bots', exact: true }).click()
  const official = page.getByTestId('group-botDensity').locator('.official').first()
  await expect(official).toHaveText('officiel Selon les joueurs')
  // one box a line of text
  const lines = await official.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return new Set([...range.getClientRects()].map((box) => Math.round(box.top))).size
  })
  expect(lines).toBe(1)
  await app.close()
})

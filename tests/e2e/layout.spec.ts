import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

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

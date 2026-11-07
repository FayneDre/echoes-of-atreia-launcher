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

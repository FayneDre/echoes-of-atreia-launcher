import { expect, test, type ElectronApplication } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'

let install: FakeInstall

test.beforeEach(async () => {
  install = await createFakeInstall()
})

test.afterEach(async () => {
  await install.dispose()
})

function isFullScreen(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())
}

/** F11 as Windows hands it to the window: a key pressed in the page by Playwright never reaches the main process. */
async function pressF11(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'F11' })
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'F11' })
  })
}

function zoom(app: ElectronApplication): Promise<number> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())
}

test('grows the page with a larger window and back', async () => {
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  expect(await zoom(app)).toBe(1)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1180 * 1.25, 780 * 1.25))
  await expect.poll(() => zoom(app)).toBe(1.25)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1180, 780))
  await expect.poll(() => zoom(app)).toBe(1)
  await app.close()
})

test('enters full screen with F11 and leaves it by F11, Escape or its own button', async () => {
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  const leave = page.getByTestId('leave-full-screen')
  await expect(leave).toBeHidden()

  await pressF11(app)
  await expect.poll(() => isFullScreen(app)).toBe(true)
  await expect(leave).toBeVisible()
  await pressF11(app)
  await expect.poll(() => isFullScreen(app)).toBe(false)
  await expect(leave).toBeHidden()

  await pressF11(app)
  await expect(leave).toBeVisible()
  await page.keyboard.press('Escape')
  await expect.poll(() => isFullScreen(app)).toBe(false)

  await pressF11(app)
  await expect(leave).toBeVisible()
  await leave.click()
  await expect.poll(() => isFullScreen(app)).toBe(false)
  await expect(leave).toBeHidden()
  await app.close()
})

test('Escape closes an open dialog before it leaves full screen', async () => {
  const { app, page } = await launchWith(install)
  await expect(page.getByTestId('install-summary')).toBeVisible()
  await pressF11(app)
  await expect(page.getByTestId('leave-full-screen')).toBeVisible()
  await page.getByRole('button', { name: /Signaler un problème|Report a problem/ }).click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  expect(await isFullScreen(app)).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(() => isFullScreen(app)).toBe(false)
  await app.close()
})

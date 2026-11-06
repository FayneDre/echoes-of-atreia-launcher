import { expect, type Page } from '@playwright/test'

/** Saves the page and waits for the "Saved." toast of this save, not one an earlier save left on screen. */
export async function save(page: Page): Promise<void> {
  const shown = page.getByTestId('toast').filter({ hasText: 'Saved.' })
  const before = (await shown.count()) > 0 ? await shown.last().getAttribute('data-toast-id') : null
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(async () => ((await shown.count()) > 0 ? await shown.last().getAttribute('data-toast-id') : null), { timeout: 10_000 })
    .not.toBe(before)
  await expect(shown.last()).toBeVisible()
}

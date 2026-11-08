import { defineConfig } from '@playwright/test'

/** The README's pictures, taken of the built launcher against the e2e tests' fake install: `npm run screenshots`. */
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  reporter: 'list'
})

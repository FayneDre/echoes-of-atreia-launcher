import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // the first detection of the servers takes about a second, up to several on a machine short of memory
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: 'list'
})

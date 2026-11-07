import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // the first detection of the servers takes about a second, up to several on a machine short of memory
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // each worker is a launcher with its fake servers: eight at once (half of 16 threads) left tests waiting past their timeouts on a machine
  // with 1 GB free, a different test each run; four hold
  workers: 4,
  reporter: 'list'
})

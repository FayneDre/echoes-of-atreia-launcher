import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { createFakeInstall, launchWith, type FakeInstall } from './fakeInstall'
import { ServerFeedServer } from './serverFeed'

const READY_TIMEOUT = 30_000
test.use({ actionTimeout: 15_000 })
let install: FakeInstall
let feed: ServerFeedServer
let javaHome: string

const installed = (path: string): string => join(install.serverRoot, ...path.split('/'))
const read = (path: string): string => readFileSync(installed(path), 'utf8')
const put = (path: string, content: string): void => {
  mkdirSync(join(installed(path), '..'), { recursive: true })
  writeFileSync(installed(path), content)
}

test.beforeEach(async () => {
  install = await createFakeInstall()
  feed = new ServerFeedServer(join(install.root, 'server-feed'))
  await feed.start()
  // a JDK: a java.home holding the compiler
  javaHome = join(install.root, 'jdk')
  mkdirSync(join(javaHome, 'bin'), { recursive: true })
  writeFileSync(join(javaHome, 'bin', 'javac.exe'), '')
  // what a server built from git holds that the release no longer does
  put('game-server/libs/stale-1.0.jar', 'stale')
  put('game-server/data/handlers/Removed.java', 'class Removed {}')
  put('game-server/data/navmesh/110010000.walked', 'what the tester walked')
})

test.afterEach(async () => {
  await feed.stop()
  await install.dispose()
})

async function open(env: Record<string, string> = {}): ReturnType<typeof launchWith> {
  const launched = await launchWith(install, { ECHOES_SERVER_FEED: feed.url, ECHOES_FAKE_JAVA_HOME: javaHome, ...env })
  await launched.page.getByRole('button', { name: 'EN' }).click()
  return launched
}

/** The bundle of a release: a new jar, a new handler, the data files the launcher reads, a default file changed upstream. */
function bundleFiles(): Record<string, string> {
  return {
    'game-server/libs/game-server-2.0.jar': 'the new server',
    'game-server/data/handlers/Kept.java': 'class Kept {}',
    'game-server/data/static_data/player_experience_table.xml': read('game-server/data/static_data/player_experience_table.xml'),
    'game-server/data/static_data/world_maps.xml': read('game-server/data/static_data/world_maps.xml'),
    'game-server/config/main/rates.properties': 'gameserver.rates.xp.solo = 3.0, 3.0\n',
    'game-server/config/main/added.properties': 'gameserver.added = true\n',
    'game-server/start.bat': read('game-server/start.bat')
  }
}

async function startServers(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start the servers' }).click()
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
}

test('installs a release over a server built from git, then puts it back', async () => {
  // the stack is started three times: by hand, after the update and after the return
  test.setTimeout(180_000)
  feed.publishMaps('v0.1.0-beta.1', { 'game-server/data/navmesh/110010000.nav': 'the map of the first release' })
  await feed.publish({
    tag: 'v0.2.0-beta.1',
    files: bundleFiles(),
    navmesh: {
      'game-server/data/navmesh/110010000.nav': { content: 'the map of the first release', release: 'v0.1.0-beta.1' },
      'game-server/data/navmesh/220010000.nav': { content: 'a map rebuilt for this one' }
    }
  })
  const { app, page } = await open()
  const panel = page.getByTestId('server-update')
  await expect(panel).toHaveAttribute('data-status', 'available', { timeout: 20_000 })
  await expect(panel).toContainText('Server v0.2.0-beta.1 is available')
  await panel.getByText('What’s new').click()
  await expect(page.getByTestId('server-update-notes')).toHaveText('What changes in server v0.2.0-beta.1')
  await startServers(page)

  await panel.getByRole('button', { name: 'Update the server' }).click()
  await expect(panel).toHaveAttribute('data-status', 'confirm', { timeout: 20_000 })
  // nothing is stopped while it downloads and checks
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready')
  await expect(page.getByTestId('server-update-mark-applied')).toBeVisible()
  await expect(page.getByTestId('server-update-kept')).toHaveText('game-server/config/main/rates.properties')

  await panel.getByRole('button', { name: 'Install' }).click()
  await expect(panel).toHaveAttribute('data-status', 'current', { timeout: 60_000 })
  await expect(page.getByTestId('server-update-installed')).toContainText('v0.2.0-beta.1')
  // the servers that ran are running again
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })

  expect(read('game-server/libs/game-server-2.0.jar')).toBe('the new server')
  expect(read('game-server/config/main/added.properties')).toBe('gameserver.added = true\n')
  expect(existsSync(installed('game-server/libs/stale-1.0.jar'))).toBe(false)
  expect(existsSync(installed('game-server/data/handlers/Removed.java'))).toBe(false)
  // the person's edited default stays, the release's beside it
  expect(read('game-server/config/main/rates.properties')).toContain('gameserver.rates.xp.solo = 1.0, 2.0')
  expect(read('game-server/config/main/rates.properties.new-v0.2.0-beta.1')).toBe('gameserver.rates.xp.solo = 3.0, 3.0\n')
  expect(read('game-server/config/mygs.properties')).toContain('database.user = aion')
  expect(read('game-server/data/navmesh/110010000.nav')).toBe('the map of the first release')
  expect(read('game-server/data/navmesh/220010000.nav')).toBe('a map rebuilt for this one')
  expect(read('game-server/data/navmesh/110010000.walked')).toBe('what the tester walked')
  expect(read('sql-calls.txt').trim()).toBe('apply mark=True')
  expect(JSON.parse(read('manifest.json'))).toMatchObject({ source: 'release', version: 'v0.2.0-beta.1' })

  await expect(panel).toContainText('Puts back the server built from its sources. The database keeps')
  await panel.getByRole('button', { name: 'Undo the v0.2.0-beta.1 update' }).click()
  await expect(panel).toHaveAttribute('data-status', 'available', { timeout: 60_000 })
  await expect(page.getByTestId('status-game')).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT })
  expect(read('game-server/libs/stale-1.0.jar')).toBe('stale')
  expect(read('game-server/data/handlers/Removed.java')).toBe('class Removed {}')
  expect(existsSync(installed('game-server/libs/game-server-2.0.jar'))).toBe(false)
  expect(existsSync(installed('game-server/config/main/rates.properties.new-v0.2.0-beta.1'))).toBe(false)
  expect(existsSync(installed('game-server/data/navmesh/220010000.nav'))).toBe(false)
  expect(existsSync(installed('manifest.json'))).toBe(false)
  // closing with servers running asks what to do with them
  await page.getByRole('button', { name: 'Stop the servers' }).click()
  for (const id of ['game', 'login', 'chat']) {
    await expect(page.getByTestId(`status-${id}`)).toHaveAttribute('data-status', 'stopped', { timeout: READY_TIMEOUT })
  }
  await app.close()
})

test('offers no release to a development install', async () => {
  await feed.publish({ tag: 'v0.2.0-beta.1', files: bundleFiles() })
  writeFileSync(join(install.serverRoot, 'manifest.json'), JSON.stringify({ source: 'deploy', version: 'dev', revision: 'c979e97', apiLevel: 1 }))
  const { app, page } = await open()
  const panel = page.getByTestId('server-update')
  await expect(panel).toHaveAttribute('data-status', 'dev', { timeout: 20_000 })
  await expect(page.getByTestId('server-update-dev')).toContainText('revision c979e97')
  await expect(panel.getByRole('button', { name: 'Update the server' })).toHaveCount(0)
  await app.close()
})

test('installs nothing without a JDK, and nothing that is not what its release names', async () => {
  await feed.publish({ tag: 'v0.2.0-beta.1', files: bundleFiles() })
  // a JRE: no compiler beside java
  const { app, page } = await open({ ECHOES_FAKE_JAVA_HOME: join(install.root, 'jre') })
  const panel = page.getByTestId('server-update')
  await expect(panel).toHaveAttribute('data-status', 'available', { timeout: 20_000 })
  await panel.getByRole('button', { name: 'Update the server' }).click()
  await expect(page.getByTestId('server-update-jdk')).toContainText('JDK 25')
  await expect(panel.getByRole('button', { name: 'Install' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel).toHaveAttribute('data-status', 'available', { timeout: 20_000 })
  await app.close()

  await feed.publish({ tag: 'v0.2.0-beta.2', files: bundleFiles(), corrupt: true })
  const again = await open()
  const panelAgain = again.page.getByTestId('server-update')
  await expect(panelAgain).toContainText('Server v0.2.0-beta.2 is available', { timeout: 20_000 })
  await panelAgain.getByRole('button', { name: 'Update the server' }).click()
  await expect(panelAgain).toHaveAttribute('data-status', 'failed', { timeout: 20_000 })
  await expect(again.page.getByTestId('server-update-problem')).toContainText('nothing was installed')
  expect(existsSync(installed('game-server/libs/game-server-2.0.jar'))).toBe(false)
  expect(read('game-server/libs/stale-1.0.jar')).toBe('stale')
  await again.app.close()
})

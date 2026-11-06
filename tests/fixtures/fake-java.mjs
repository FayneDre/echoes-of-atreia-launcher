// Stands in for java.exe in the end-to-end tests (ECHOES_FAKE_JAVA). It answers `-version`, and otherwise plays the server its main
// class names, doing what the launcher relies on: it moves its old console log aside and writes a new one, listens on the port its
// config names, and the game server refuses to start without the login and chat servers, registers a little later, and stops on
// shutdown.request. Files in the server folder change how it behaves: fail-on-start makes it crash at once, slow-start opens its port
// 20 s late (a game server still loading its data), slow-register registers 20 s late (one loading its world), no-admin makes the game
// server ignore the admin folder (a build from before it), old-api makes it answer `version` as a server older than the API levels.
// Otherwise the game server answers the requests of `admin/`: version (level 1), reload-config, destinations, and teleport, which only
// character 101 (in game in the fake database) accepts.
import { existsSync, mkdirSync, appendFileSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'

const TAB = String.fromCharCode(9)
const NEWLINE = String.fromCharCode(10)
const args = process.argv.slice(2)
if (args.includes('-version')) {
  process.stderr.write('openjdk version "25.0.1" 2025-10-21\n')
  process.exit(0)
}

const mainClass = args.at(-1) ?? ''
const kind = mainClass.includes('chatserver') ? 'chat' : mainClass.includes('loginserver') ? 'login' : 'game'

function readProperties(file) {
  const result = new Map()
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#!=\s]+)\s*=\s*(.*?)\s*$/)
    if (match) result.set(match[1], match[2])
  }
  return result
}

const network = readProperties(join('config', 'network', 'network.properties'))
const portOf = (key) => Number(network.get(key).split(':').at(-1))

mkdirSync(join('log', 'archived'), { recursive: true })
const logFile = join('log', 'server_console.log')
if (existsSync(logFile)) {
  renameSync(logFile, join('log', 'archived', `server_console-${Date.now()}.log`))
}
const log = (message) => appendFileSync(logFile, `${new Date().toISOString()} INFO  [main] - ${message}\n`)

log(`Fake ${kind} server starting`)
if (existsSync('fail-on-start')) {
  process.stderr.write('Exception in thread "main" java.lang.IllegalStateException: fake failure on start\n')
  log('Fake failure on start')
  process.exit(1)
}

function reachable(port) {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

const listenKey = {
  chat: 'chatserver.network.gameserver.socket_address',
  login: 'loginserver.network.gameserver.socket_address',
  game: 'gameserver.network.client.socket_address'
}[kind]

async function main() {
  if (kind === 'game') {
    for (const [name, key] of [
      ['login', 'gameserver.network.login.address'],
      ['chat', 'gameserver.network.chat.address']
    ]) {
      if (!(await reachable(portOf(key)))) {
        process.stderr.write(`Could not connect to ${name} server\n`)
        log(`Could not connect to ${name} server`)
        process.exit(2)
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, existsSync('slow-start') ? 20_000 : 300))
  createServer((socket) => socket.destroy()).listen(portOf(listenKey), '127.0.0.1', () => log(`Listening on ${portOf(listenKey)}`))

  if (kind === 'game') {
    setTimeout(() => log('Connected to login server'), existsSync('slow-register') ? 20_000 : 800)
    mkdirSync('admin', { recursive: true })
    setInterval(() => {
      if (!existsSync('no-admin')) {
        for (const name of readdirSync('admin').filter((n) => n.endsWith('.request'))) {
          const command = readFileSync(join('admin', name), 'utf8').trim()
          rmSync(join('admin', name), { force: true })
          const [verb, ...words] = command.split(/\s+/)
          let answer = 'error unknown command'
          if (verb === 'version') {
            answer = existsSync('old-api') ? 'error unknown command version' : ['ok', 'version v0.1.0-beta.1', 'revision abc1234', 'api 1'].join(NEWLINE)
          } else if (verb === 'reload-config') {
            log('Admin channel: configuration reloaded')
            answer = 'ok'
          } else if (verb === 'destinations') {
            const place = (...fields) => fields.join(TAB)
            answer = [
              'ok',
              place(7, 110010000, 1, 2, 3, 'Sanctum'),
              place(8, 210010000, 4, 5, 6, 'Pandaemonium'),
              place(9, 110010000, 7, 8, 9, 'Sanctum')
            ].join(NEWLINE)
          } else if (verb === 'teleport') {
            if (words[0] === '101') {
              log(`Admin channel: teleport ${words.join(' ')}`)
              answer = 'ok'
            } else {
              answer = 'error not in game'
            }
          }
          const id = name.slice(0, -'.request'.length)
          writeFileSync(join('admin', id + '.tmp'), answer + NEWLINE)
          renameSync(join('admin', id + '.tmp'), join('admin', id + '.response'))
        }
      }
      if (existsSync('shutdown.request')) {
        rmSync('shutdown.request', { force: true })
        log('Shutdown requested: saving players')
        setTimeout(() => {
          log('Shutdown complete')
          process.exit(0)
        }, 500)
      }
    }, 200)
  }
}

// The fakes are detached like the real servers, so a test that fails half-way would leave them behind: they end themselves.
setTimeout(() => process.exit(0), 90_000)

void main()

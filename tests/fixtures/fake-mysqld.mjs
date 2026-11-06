// Stands in for mysqld.exe in the end-to-end tests (ECHOES_FAKE_MYSQLD): listens on the --port it is given until the fake mysqladmin asks
// it to shut down, by a marker file in ECHOES_FAKE_MYSQL_DATA. It also stops by itself after a while, so a failed test leaves nothing behind.
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

const args = process.argv.slice(2)
const port = Number(args.find((arg) => arg.startsWith('--port='))?.slice('--port='.length))
const optionsFile = args.find((arg) => arg.startsWith('--defaults-file='))?.slice('--defaults-file='.length)
const data = process.env.ECHOES_FAKE_MYSQL_DATA
const marker = join(data, 'mysqld-shutdown')
writeFileSync(join(data, 'mysqld-args.json'), JSON.stringify(args))
if (!optionsFile || !existsSync(optionsFile)) {
  process.exit(1)
}
const server = createServer((socket) => socket.destroy())
server.listen(port, '127.0.0.1')
const end = () => server.close(() => process.exit(0))
setInterval(() => {
  if (existsSync(marker)) {
    rmSync(marker, { force: true })
    end()
  }
}, 100)
setTimeout(end, 120_000)

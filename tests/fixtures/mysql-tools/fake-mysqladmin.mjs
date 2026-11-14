// Stands in for mysqladmin in the end-to-end tests (ECHOES_FAKE_MYSQL_TOOLS): `shutdown` asks the fake mysqld to stop, by a marker file in
// ECHOES_FAKE_MYSQL_DATA. Another marker makes it refuse, as MySQL does for an account without the SHUTDOWN privilege. Like the real one, it
// fails when nothing answers on the option file's port.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const args = process.argv.slice(2)
const optionFile = args[0]?.startsWith('--defaults-extra-file=') ? args[0].slice('--defaults-extra-file='.length) : null
if (!optionFile || !/^\[client\]/.test(readFileSync(optionFile, 'utf8'))) {
  process.stderr.write('mysqladmin: ERROR 1045: Access denied (no option file first)\n')
  process.exit(1)
}
const options = readFileSync(optionFile, 'utf8')
const named = (/^host=(.*)$/m.exec(options)?.[1]?.trim() || '127.0.0.1').replace(/^"(.*)"$/, '$1')
// the MySQL client's localhost is the IPv4 loopback, never ::1
const host = named === 'localhost' ? '127.0.0.1' : named
const port = Number(/^port=(\d+)$/m.exec(options)?.[1] ?? 3306)
const answers = await new Promise((done) => {
  const socket = connect({ host, port }, () => {
    socket.destroy()
    done(true)
  })
  socket.once('error', () => done(false))
})
if (!answers) {
  process.stderr.write(`mysqladmin: connect to server at '${host}' failed
error: 'Can't connect to MySQL server on '${host}:${port}' (10061)'
`)
  process.exit(1)
}
const data = process.env.ECHOES_FAKE_MYSQL_DATA
if (existsSync(join(data, 'refuse-shutdown'))) {
  process.stderr.write("mysqladmin: shutdown failed; error: 'Access denied; you need (at least one of) the SHUTDOWN privilege(s)'\n")
  process.exit(1)
}
if (args.at(-1) === 'shutdown') {
  writeFileSync(join(data, 'mysqld-shutdown'), '')
}

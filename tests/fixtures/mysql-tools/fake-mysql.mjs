// Stands in for the mysql client in the end-to-end tests (ECHOES_FAKE_MYSQL_TOOLS): reads a dump on its input and makes it the content of the
// database file ECHOES_FAKE_MYSQL_DATA/<name>.sql, as running the real dump replaces the tables.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const optionFile = args[0]?.startsWith('--defaults-extra-file=') ? args[0].slice('--defaults-extra-file='.length) : null
if (!optionFile || !/^\[client\]/.test(readFileSync(optionFile, 'utf8'))) {
  process.stderr.write('mysql: ERROR 1045: Access denied (no option file first)\n')
  process.exit(1)
}
const database = args.at(-1)
const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  const dump = Buffer.concat(chunks).toString('utf8')
  writeFileSync(join(process.env.ECHOES_FAKE_MYSQL_DATA, `${database}.sql`), dump.replace(/^-- fake dump of .*\n/, ''))
})

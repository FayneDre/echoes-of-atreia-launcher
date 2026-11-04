// Stands in for mysqldump in the end-to-end tests (ECHOES_FAKE_MYSQL_TOOLS). A database is a file ECHOES_FAKE_MYSQL_DATA/<name>.sql; the
// dump is its content under a header. Like the real one it needs its credentials from the option file given first, and fails on an unknown
// database.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const optionFile = args[0]?.startsWith('--defaults-extra-file=') ? args[0].slice('--defaults-extra-file='.length) : null
if (!optionFile || !/^\[client\]\s*\nuser=".+"\npassword=".*"/.test(readFileSync(optionFile, 'utf8'))) {
  process.stderr.write('mysqldump: Got error: 1045: Access denied (no option file first)\n')
  process.exit(2)
}
const resultFile = args.find((arg) => arg.startsWith('--result-file='))?.slice('--result-file='.length)
const database = args.at(-1)
const source = join(process.env.ECHOES_FAKE_MYSQL_DATA, `${database}.sql`)
if (!existsSync(source)) {
  process.stderr.write(`mysqldump: Got error: 1049: Unknown database '${database}' when selecting the database\n`)
  process.exit(2)
}
writeFileSync(resultFile, `-- fake dump of ${database}\n${readFileSync(source, 'utf8')}`)

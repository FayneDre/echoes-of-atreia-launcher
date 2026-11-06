import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultsFileOf, executableOf, lastErrors, parseOptionFile } from '../../src/main/server/mysql'

// The command line the MySQL installer gives its Windows service.
const SERVICE_PATH = '"C:\\Program Files\\MySQL\\MySQL Server 26.7\\bin\\mysqld.exe" --defaults-file="C:\\ProgramData\\MySQL\\MySQL Server 26.7\\my.ini" MySQL267'

describe('the MySQL service', () => {
  it('reads the program and the my.ini of its command line', () => {
    expect(executableOf(SERVICE_PATH)).toBe('C:\\Program Files\\MySQL\\MySQL Server 26.7\\bin\\mysqld.exe')
    expect(defaultsFileOf(SERVICE_PATH)).toBe('C:\\ProgramData\\MySQL\\MySQL Server 26.7\\my.ini')
    expect(defaultsFileOf('C:\\mysql\\bin\\mysqld.exe --defaults-file=C:\\mysql\\my.ini MySQL')).toBe('C:\\mysql\\my.ini')
    expect(defaultsFileOf('"C:\\mysql\\bin\\mysqld.exe" MySQL')).toBeNull()
  })
})

describe('a MySQL option file', () => {
  it('keeps the server groups only, with - and _ alike, quotes removed and the last line winning', () => {
    const options = parseOptionFile(
      [
        '[client]',
        'port=3307',
        '[mysqld]',
        '# a comment',
        'port=3306',
        'datadir="C:/ProgramData/MySQL/MySQL Server 26.7/Data"',
        'log-error = "HOST.err"',
        'skip-name-resolve',
        '[server]',
        'port=3308'
      ].join('\r\n')
    )
    expect(options.get('port')).toBe('3308')
    expect(options.get('datadir')).toBe('C:/ProgramData/MySQL/MySQL Server 26.7/Data')
    expect(options.get('log_error')).toBe('HOST.err')
    expect(options.has('skip_name_resolve')).toBe(true)
  })
})

describe('the MySQL error log', () => {
  let folder: string | null = null
  afterEach(() => {
    if (folder) {
      rmSync(folder, { recursive: true, force: true })
      folder = null
    }
  })

  it('gives the last errors of the log the option file places, relative to its datadir', async () => {
    folder = mkdtempSync(join(tmpdir(), 'echoes-mysql-'))
    const ini = join(folder, 'my.ini')
    writeFileSync(ini, `[mysqld]\ndatadir=${folder.replace(/\\/g, '/')}\nlog-error=server.err\n`)
    const lines = [
      '2026-11-06T10:00:00Z 0 [System] [MY-010116] [Server] mysqld starting',
      '2026-11-06T10:00:01Z 0 [ERROR] [MY-010273] [Server] Could not create unix socket lock file',
      '2026-11-06T10:00:01Z 0 [ERROR] [MY-010119] [Server] Aborting',
      '2026-11-06T10:00:02Z 0 [System] [MY-010910] [Server] Shutdown complete'
    ]
    writeFileSync(join(folder, 'server.err'), lines.join('\r\n'))
    expect(await lastErrors(ini)).toEqual([lines[1], lines[2]])
  })

  it('gives nothing when there is no file to read', async () => {
    expect(await lastErrors(null)).toEqual([])
    expect(await lastErrors(join(tmpdir(), 'no-such-folder', 'my.ini'))).toEqual([])
  })
})

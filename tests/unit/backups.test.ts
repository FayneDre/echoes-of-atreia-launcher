import { describe, expect, it, vi } from 'vitest'

// The service reaches Electron only through modules it imports for other purposes; none of it runs here.
vi.mock('electron', () => ({ app: { getPath: () => '' }, safeStorage: {} }))

const { backupIdFor, dumpOptionsFrom, optionValue } = await import('../../src/main/backup/backupService')

describe('backups', () => {
  it('names a backup by its local date and time, so the folders sort as they read', () => {
    expect(backupIdFor(new Date(2026, 10, 4, 9, 5, 7))).toBe('2026-11-04_09-05-07')
    expect(backupIdFor(new Date(2026, 0, 31, 23, 59, 59))).toBe('2026-01-31_23-59-59')
  })

  it('passes mysqldump only the options its version knows', () => {
    // MySQL 26.7's help, cut down: both options.
    const mysql26 = '--set-gtid-purged[=name]\n  Add SET @@GLOBAL.GTID_PURGED\n--masking-policies  Dump masking policies\n'
    expect(dumpOptionsFrom(mysql26)).toEqual(['--set-gtid-purged=OFF', '--skip-masking-policies'])
    // MySQL 8.0 has GTIDs but no masking policies; MariaDB has neither.
    expect(dumpOptionsFrom('--set-gtid-purged[=name]\n')).toEqual(['--set-gtid-purged=OFF'])
    expect(dumpOptionsFrom('mysqldump  Ver 10.19 Distrib 10.11.6-MariaDB\n')).toEqual([])
  })

  it('quotes a password for a MySQL option file, whatever it holds', () => {
    expect(optionValue('plain')).toBe('"plain"')
    // A # would start a comment and a space end the value, unquoted; quotes and backslashes are escaped inside the quotes.
    expect(optionValue('p"a\\ss #word')).toBe('"p\\"a\\\\ss #word"')
    expect(optionValue('')).toBe('""')
  })
})

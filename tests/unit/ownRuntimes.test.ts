import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findMysqlBinDir } from '../../src/main/server/mysql'
import { ownJavaOf, ownMysqlOf, withPathFirst } from '../../src/main/server/ownRuntimes'
import { javaCommand } from '../../src/main/system/java'

const JAVA = process.platform === 'win32' ? 'java.exe' : 'java'
let root: string

function touch(...parts: string[]): void {
  const file = join(root, ...parts)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, '')
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'echoes-own-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe("an install's own Java", () => {
  it('is found in <root>/runtime/bin, and only when the program is there', () => {
    expect(ownJavaOf(root)).toBeNull()
    expect(ownJavaOf(null)).toBeNull()
    touch('runtime', 'bin', JAVA)
    expect(ownJavaOf(root)).toEqual({ executable: join(root, 'runtime', 'bin', JAVA), binDir: join(root, 'runtime', 'bin') })
  })

  it('is what the servers are started with, first in the PATH', () => {
    touch('runtime', 'bin', JAVA)
    const command = javaCommand(root)
    expect(command.command).toBe(join(root, 'runtime', 'bin', JAVA))
    const pathKey = Object.keys(command.env).find((key) => key.toLowerCase() === 'path')!
    expect(command.env[pathKey]!.startsWith(join(root, 'runtime', 'bin'))).toBe(true)
  })

  it("leaves the machine's Java alone when the install has none", () => {
    expect(javaCommand(root).command).toBe(JAVA)
    expect(javaCommand().command).toBe(JAVA)
  })
})

describe("an install's own MySQL", () => {
  it('needs the program and the my.ini setup-mysql.ps1 wrote', async () => {
    touch('mysql', 'bin', 'mysqld.exe')
    expect(ownMysqlOf(root)).toBeNull()
    touch('mysql', 'my.ini')
    expect(ownMysqlOf(root)).toEqual({ binDir: join(root, 'mysql', 'bin'), optionsFile: join(root, 'mysql', 'my.ini') })
    expect(await findMysqlBinDir(root)).toBe(join(root, 'mysql', 'bin'))
  })
})

describe('the PATH', () => {
  it('gets the folder first under the name the system gave it, never as a second key', () => {
    const env = withPathFirst({ Path: 'C:\\Windows', Other: 'x' }, 'C:\\own')
    expect(Object.keys(env).filter((key) => key.toLowerCase() === 'path')).toEqual(['Path'])
    expect(env['Path']!.startsWith('C:\\own')).toBe(true)
    expect(env['Path']!.endsWith('C:\\Windows')).toBe(true)
    expect(withPathFirst({}, 'C:\\own')['PATH']).toBe('C:\\own')
  })
})

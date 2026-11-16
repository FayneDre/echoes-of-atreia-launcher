import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkMachine, checkRuntimes } from '../../src/main/serverUpdate/preflight'

describe('the checks before an install from nothing', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'echoes-preflight-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('pass on this machine, with real PowerShell, and leave nothing in the folder', async () => {
    const folder = join(root, 'EchoesServer')
    expect(await checkMachine(folder)).toBeNull()
    expect(await readdir(folder)).toEqual([])
  }, 60_000)

  const answering = (output: string, code = 0) => async () => ({ code, output })

  it('say a constrained language first, though the rest of the probe failed because of it', async () => {
    expect(await checkMachine(root, answering('language=ConstrainedLanguage\nCannot invoke method', 1))).toEqual({
      code: 'setup-check-language',
      detail: 'ConstrainedLanguage'
    })
  })

  it('say a script PowerShell would not run, and a port listing too slow for MySQL’s start', async () => {
    expect(await checkMachine(root, answering('cannot be loaded because running scripts is disabled on this system', 1))).toMatchObject({
      code: 'setup-check-powershell',
      detail: expect.stringContaining('running scripts is disabled')
    })
    expect(await checkMachine(root, answering('language=FullLanguage\nports-ms=42000\nprobe=done'))).toEqual({ code: 'setup-check-ports', detail: '42 s' })
    expect(await checkMachine(root, answering('language=FullLanguage\nports-ms=120\nprobe=done'))).toBeNull()
  })

  it('say a folder that takes no file', async () => {
    const file = join(root, 'a-file')
    await writeFile(file, '')
    expect(await checkMachine(join(file, 'server'))).toMatchObject({ code: 'setup-check-folder' })
  })

  it('say a runtime program that does not start, and skip a runtime the release does not carry', async () => {
    const mysql = join(root, 'mysql')
    await mkdir(join(mysql, 'bin'), { recursive: true })
    await writeFile(join(mysql, 'bin', 'mysqld.exe'), 'not a program')
    expect(await checkRuntimes({ mysql })).toMatchObject({ code: 'setup-check-runtime', detail: expect.stringContaining('mysqld.exe') })
    expect(await checkRuntimes({})).toBeNull()
  })
})

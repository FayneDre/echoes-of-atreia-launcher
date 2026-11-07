import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseNotesFile, readLocalNews } from '../../src/main/localNotes'

const FRENCH = `# Patch notes

What this file is.

---

## v0.1.0-beta.2 — 06/11/2026

**Premier patch livré tout compilé.**

- un changement

---

## patch-2026-11-03 — 03/11/2026

Un patch nommé par sa date.

---

## v0.1.0-beta.1 — 05/11/2026

Le premier.
`

const ENGLISH = `# Patch notes (English)

---

## v0.1.0-beta.2 — 2026-11-06

**First patch shipped built.**

- one change

---

## v0.1.0-beta.1 — 2026-11-05

The first.
`

describe('parseNotesFile', () => {
  it('reads each version heading and what follows it, without the closing rule, and leaves a patch named by its date out', () => {
    expect(parseNotesFile(FRENCH)).toEqual([
      { tag: 'v0.1.0-beta.2', date: '2026-11-06T12:00:00Z', body: '**Premier patch livré tout compilé.**\n\n- un changement' },
      { tag: 'v0.1.0-beta.1', date: '2026-11-05T12:00:00Z', body: 'Le premier.' }
    ])
  })

  it('reads a file written with Windows line endings the same', () => {
    expect(parseNotesFile(ENGLISH.replace(/\n/g, '\r\n'))[0]).toEqual({
      tag: 'v0.1.0-beta.2',
      date: '2026-11-06T12:00:00Z',
      body: '**First patch shipped built.**\n\n- one change'
    })
  })
})

describe('readLocalNews', () => {
  let repository: string

  afterEach(async () => {
    await rm(repository, { recursive: true, force: true })
  })

  it('pairs the French and English entries by version, newest first', async () => {
    repository = await mkdtemp(join(tmpdir(), 'echoes-notes-'))
    await mkdir(join(repository, 'docs', 'patch-notes'), { recursive: true })
    await writeFile(join(repository, 'docs', 'patch-notes', 'current.md'), FRENCH)
    await writeFile(join(repository, 'docs', 'patch-notes', 'current.en.md'), ENGLISH)
    const items = await readLocalNews('server', repository, 'owner/server', 4)
    expect(items.map((item) => item.tag)).toEqual(['v0.1.0-beta.2', 'v0.1.0-beta.1'])
    expect(items[0]).toMatchObject({
      source: 'server',
      prerelease: true,
      date: '2026-11-06T12:00:00Z',
      url: 'https://github.com/owner/server/releases/tag/v0.1.0-beta.2',
      notes: { en: '**First patch shipped built.**\n\n- one change', fr: '**Premier patch livré tout compilé.**\n\n- un changement' }
    })
  })

  it('gives nothing for a repository that is not there', async () => {
    repository = join(tmpdir(), 'echoes-notes-missing')
    expect(await readLocalNews('launcher', repository, 'owner/launcher', 4)).toEqual([])
    expect(await readLocalNews('launcher', null, 'owner/launcher', 4)).toEqual([])
  })
})

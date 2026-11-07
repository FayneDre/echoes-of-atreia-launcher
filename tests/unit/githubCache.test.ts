import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchGithubJson, setGithubCacheDir } from '../../src/main/github/cachedJson'

/** GitHub as the launcher meets it: an ETag on each answer, a 304 for a question that carries it, or a refusal once the hour is spent. */
let mode: 'answer' | 'refuse' = 'answer'
let body = [{ tag_name: 'v1' }]
const asked: IncomingHttpHeaders[] = []
let server: Server
let url: string
let dir: string

beforeEach(async () => {
  mode = 'answer'
  body = [{ tag_name: 'v1' }]
  asked.length = 0
  dir = await mkdtemp(join(tmpdir(), 'echoes-github-'))
  // every question goes out unless a test says otherwise
  setGithubCacheDir(dir, 0)
  server = createServer((request, response) => {
    asked.push(request.headers)
    if (mode === 'refuse') {
      response.statusCode = 403
      response.end('{"message":"API rate limit exceeded"}')
      return
    }
    const etag = `"${JSON.stringify(body).length}-${body[0]!.tag_name}"`
    if (request.headers['if-none-match'] === etag) {
      response.statusCode = 304
      response.end()
      return
    }
    response.setHeader('ETag', etag)
    response.end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/releases`
})

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve))
  setGithubCacheDir(null)
  await rm(dir, { recursive: true, force: true })
})

describe('fetchGithubJson', () => {
  it('asks again with the ETag, and takes a 304 for the answer it kept', async () => {
    expect(await fetchGithubJson(url)).toEqual({ body: [{ tag_name: 'v1' }], freshness: 'fetched' })
    expect(asked[0]!['if-none-match']).toBeUndefined()

    expect(await fetchGithubJson(url)).toEqual({ body: [{ tag_name: 'v1' }], freshness: 'unchanged' })
    expect(asked[1]!['if-none-match']).toBe('"19-v1"')

    body = [{ tag_name: 'v2' }]
    expect(await fetchGithubJson(url)).toEqual({ body: [{ tag_name: 'v2' }], freshness: 'fetched' })
  })

  it('gives the answer it kept when GitHub refuses, and throws only when nothing was kept', async () => {
    mode = 'refuse'
    await expect(fetchGithubJson(url)).rejects.toThrow('403')

    mode = 'answer'
    await fetchGithubJson(url)
    mode = 'refuse'
    expect(await fetchGithubJson(url)).toEqual({ body: [{ tag_name: 'v1' }], freshness: 'stale' })
  })

  it('gives the answer it kept when GitHub cannot be reached', async () => {
    await fetchGithubJson(url)
    await new Promise((resolve) => server.close(resolve))
    expect(await fetchGithubJson(url)).toEqual({ body: [{ tag_name: 'v1' }], freshness: 'stale' })
    server.listen(0, '127.0.0.1')
  })

  it('uses an answer younger than a few minutes without asking', async () => {
    setGithubCacheDir(dir, 60_000)
    await fetchGithubJson(url)
    body = [{ tag_name: 'v2' }]
    expect(await fetchGithubJson(url)).toEqual({ body: [{ tag_name: 'v1' }], freshness: 'unchanged' })
    expect(asked).toHaveLength(1)
  })

  it('keeps nothing without a folder', async () => {
    setGithubCacheDir(null)
    await fetchGithubJson(url)
    await fetchGithubJson(url)
    expect(asked[1]!['if-none-match']).toBeUndefined()
  })
})

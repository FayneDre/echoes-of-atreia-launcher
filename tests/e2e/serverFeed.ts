import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import yazl from 'yazl'

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

/**
 * The SQL script of a test bundle: says whether the database has been through it (a ledger file in the install) and, with -Apply, writes
 * down how it was called, as the real one runs the statements and records them.
 */
const FAKE_APPLY_SQL = `param([string]$ServerRoot, [string]$SqlFile, [string]$MysqlBin, [switch]$MarkApplied, [switch]$Apply)
$ledger = Join-Path $ServerRoot 'ledger.txt'
Write-Output "Ledger: $(if (Test-Path $ledger) { 'present' } else { 'absent' })"
if ($Apply) {
    Add-Content (Join-Path $ServerRoot 'sql-calls.txt') "apply mark=$MarkApplied"
    Set-Content $ledger 'applied'
}
`

export interface FakeRelease {
  tag: string
  /** The bundle's files, by path from the install's root. */
  files: Record<string, string>
  /** Navmesh files and the release whose assets carry them (this one when not said). */
  navmesh?: Record<string, { content: string; release?: string }>
  /** A bundle whose bytes are not those its manifest names. */
  corrupt?: boolean
}

/**
 * The server's releases as GitHub serves them, on a local HTTP server: `releases.json` with the shape of GitHub's answer, and each release's
 * assets under `<tag>/<name>` (the bundle, its manifest, the notes, the navmesh maps it carries).
 */
export class ServerFeedServer {
  private server: Server | null = null
  url = ''
  private releases: { tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; browser_download_url: string; digest: string }[] }[] = []

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true })
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      try {
        response.end(readFileSync(join(this.dir, decodeURIComponent((request.url ?? '/').split('?')[0]!.slice(1)))))
      } catch {
        response.statusCode = 404
        response.end()
      }
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    const address = this.server.address()
    this.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()))
  }

  private asset(tag: string, name: string, bytes: Buffer | string): { name: string; browser_download_url: string; digest: string } {
    const path = join(this.dir, tag, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
    return { name, browser_download_url: `${this.url}/${tag}/${name}`, digest: `sha256:${sha256(bytes)}` }
  }

  /** A release that only carries navmesh maps, as an older one that rebuilt them. */
  publishMaps(tag: string, maps: Record<string, string>): void {
    const assets = Object.entries(maps).map(([path, content]) => this.asset(tag, `navmesh-${path.split('/').at(-1)}.gz`, gzipSync(content)))
    this.releases.push({ tag_name: tag, draft: false, prerelease: true, assets })
    this.write()
  }

  async publish(release: FakeRelease): Promise<void> {
    const files = { ...release.files, 'tools/apply-sql.ps1': FAKE_APPLY_SQL, 'game-server/sql/update.sql': 'SELECT 1;\n' }
    const navmesh = Object.fromEntries(
      Object.entries(release.navmesh ?? {}).map(([path, { content, release: carrier }]) => [
        path,
        { sha256: sha256(content), size: Buffer.byteLength(content), release: carrier ?? release.tag, asset: `navmesh-${path.split('/').at(-1)}.gz` }
      ])
    )
    const manifest = {
      source: 'release',
      version: release.tag,
      revision: 'abc1234',
      apiLevel: 1,
      java: 25,
      rules: {
        prune: ['game-server/libs/', 'game-server/data/handlers/', 'game-server/data/static_data/'],
        local: ['game-server/config/', 'game-server/start.bat']
      },
      files: Object.fromEntries(Object.entries(files).map(([path, content]) => [path, sha256(content)])),
      navmesh
    }
    const zipName = `aion-server-${release.tag}.zip`
    const zipPath = join(this.dir, release.tag, zipName)
    mkdirSync(dirname(zipPath), { recursive: true })
    const zip = new yazl.ZipFile()
    zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json')
    for (const [path, content] of Object.entries(files)) {
      zip.addBuffer(Buffer.from(release.corrupt && path.endsWith('.jar') ? `${content} tampered` : content), path)
    }
    zip.end()
    await new Promise<void>((resolve, reject) => zip.outputStream.pipe(createWriteStream(zipPath)).on('close', resolve).on('error', reject))
    const zipBytes = readFileSync(zipPath)
    // a corrupt bundle is one whose content was changed after its manifest was made: the zip's own hash is the one named
    const bundle = { name: zipName, sha256: sha256(zipBytes), size: zipBytes.length }
    const assets = [
      { name: zipName, browser_download_url: `${this.url}/${release.tag}/${zipName}`, digest: `sha256:${bundle.sha256}` },
      this.asset(release.tag, 'manifest.json', JSON.stringify({ ...manifest, bundle })),
      this.asset(release.tag, 'notes.en.md', `What changes in server ${release.tag}`),
      this.asset(release.tag, 'notes.fr.md', `Ce qui change dans le serveur ${release.tag}`)
    ]
    for (const [path, { content, release: carrier }] of Object.entries(release.navmesh ?? {})) {
      if (!carrier || carrier === release.tag) {
        assets.push(this.asset(release.tag, `navmesh-${path.split('/').at(-1)}.gz`, gzipSync(content)))
      }
    }
    this.releases.unshift({ tag_name: release.tag, draft: false, prerelease: true, assets })
    this.write()
  }

  private write(): void {
    writeFileSync(join(this.dir, 'releases.json'), JSON.stringify(this.releases))
  }
}

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import yauzl from 'yauzl'
import type { ServerFeed, ServerRelease } from './feed'
import { isSafePath, matchesRule, type ReleaseManifest, type RuntimeEntry } from './manifest'

/** What an update changes, worked out before any server is stopped. */
export interface UpdatePlan {
  /** Files of the bundle missing from the install or different there. */
  copy: string[]
  /** Default files edited by hand: left as they are, the release's own put beside each as `<file>.new-<version>`. */
  keepLocal: string[]
  /** Files of the folders the bundle owns that it no longer lists. */
  remove: string[]
  /** Navmesh files whose installed hash is not the release's. */
  navmesh: string[]
}

/** What an update did, kept with the files it replaced, so it can be undone. */
interface UndoRecord {
  from: string | null
  to: string
  at: string
  /** Paths whose previous file is kept under `files/`: replaced or removed by the update. */
  replaced: string[]
  /** Paths the update created: removed again on return. */
  added: string[]
}

export type Progress = (percent: number) => void

const STAGING = 'update-staging'
const BACKUPS = 'update-backups'

const toNative = (path: string): string => path.split('/').join('\\')

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function sha256Of(path: string): Promise<string | null> {
  try {
    const hash = createHash('sha256')
    await pipeline(createReadStream(path), hash)
    return hash.digest('hex')
  } catch {
    return null
  }
}

/** Two text files with the same content whatever their line endings. */
async function sameText(a: string, b: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([readFile(a, 'utf8'), readFile(b, 'utf8')])
    return left.replace(/\r\n/g, '\n') === right.replace(/\r\n/g, '\n')
  } catch {
    return false
  }
}

/** Every file under a folder, as paths from the install's root with forward slashes. */
async function listFiles(root: string, folder: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(join(root, toNative(folder)), { withFileTypes: true, recursive: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1).split('\\').join('/'))
}

/** Moves a file, by copying when the two places are on different volumes. */
async function move(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true })
  await rm(to, { force: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    await rm(from, { force: true })
  }
}

/** Counts the bytes going through, for a download's progress. */
function counter(total: number, progress: Progress): Transform {
  let seen = 0
  let shown = -1
  return new Transform({
    transform(chunk: Buffer, _encoding, done) {
      seen += chunk.length
      const percent = total > 0 ? Math.min(100, Math.floor((seen * 100) / total)) : 0
      if (percent !== shown) {
        shown = percent
        progress(percent)
      }
      done(null, chunk)
    }
  })
}

/** Downloads to a file, gunzipping when asked, and gives the SHA-256 of what was written. */
async function download(url: string, target: string, total: number, progress: Progress, gunzip = false): Promise<string> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`${url} answered ${response.status}`)
  }
  await mkdir(dirname(target), { recursive: true })
  const hash = createHash('sha256')
  const hasher = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk)
      done(null, chunk)
    }
  })
  const length = Number(response.headers.get('content-length')) || total
  const source = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  if (gunzip) {
    await pipeline(source, counter(length, progress), createGunzip(), hasher, createWriteStream(target))
  } else {
    await pipeline(source, counter(length, progress), hasher, createWriteStream(target))
  }
  return hash.digest('hex')
}

/**
 * A download that is kept: a file already there with the expected hash (a first install stopped half-way, a retry) is not fetched again, so
 * gigabytes of maps resume file by file. What arrives with another hash is thrown away.
 */
async function downloadChecked(url: string, target: string, expected: string, size: number, progress: Progress, gunzip = false): Promise<void> {
  if ((await sha256Of(target)) === expected) {
    progress(100)
    return
  }
  if ((await download(url, target, size, progress, gunzip)) !== expected) {
    await rm(target, { force: true })
    throw new CorruptError(`${url}: downloaded, it is not the file the manifest names`)
  }
}

/**
 * Installs a server release over an install, as the release process plan's six steps say, the servers themselves being stopped and started
 * by the caller: the bundle downloaded and checked against two hashes before it is opened, every file unpacked checked against the manifest,
 * every file replaced or removed kept under `update-backups/` so the update can be undone, and nothing outside the bundle's list touched but
 * the folders it owns. The person's files (`mygs.properties`, logs, the navmesh's own files, the database) are never named by a bundle.
 */
export class ServerInstaller {
  constructor(
    private readonly root: string,
    private readonly feed: ServerFeed
  ) {}

  private staging(release: ServerRelease): string {
    return join(this.root, STAGING, release.tag)
  }

  /** The bundle, downloaded and checked against the manifest's hash and GitHub's, then unpacked and every file checked. */
  async fetchBundle(release: ServerRelease, progress: Progress): Promise<void> {
    const bundle = release.manifest.bundle!
    const staging = this.staging(release)
    // the bundle alone: the maps and runtimes already staged and checked are kept for a retry
    await rm(join(staging, 'bundle'), { recursive: true, force: true })
    const zip = join(this.root, STAGING, `${release.tag}.zip`)
    const hash = await download(release.bundleUrl, zip, bundle.size, progress)
    if (hash !== bundle.sha256 || (release.bundleDigest !== null && hash !== release.bundleDigest)) {
      await rm(zip, { force: true })
      throw new CorruptError(`${bundle.name}: its SHA-256 is not the one its release names`)
    }
    await unzip(zip, join(staging, 'bundle'), release.manifest)
    await rm(zip, { force: true })
    for (const [path, expected] of Object.entries(release.manifest.files)) {
      if ((await sha256Of(join(staging, 'bundle', toNative(path)))) !== expected) {
        throw new CorruptError(`${path}: unpacked, it is not the file the manifest names`)
      }
    }
  }

  /** What the update would change. Hashes every file it compares, the navmesh included: a minute for a few gigabytes. */
  async plan(release: ServerRelease, previous: ReleaseManifest | null): Promise<UpdatePlan> {
    const { files, rules, navmesh } = release.manifest
    const plan: UpdatePlan = { copy: [], keepLocal: [], remove: [], navmesh: [] }
    for (const [path, wanted] of Object.entries(files)) {
      const installed = await sha256Of(join(this.root, toNative(path)))
      if (installed === wanted) {
        continue
      }
      // A default file the person may have edited: replaced only when it is missing or still the previous release's. One that differs only
      // by its line endings (git writes them as the machine wants) is the same file, and is left as it is.
      if (installed !== null && matchesRule(path, rules.local) && installed !== previous?.files[path]) {
        if (!(await sameText(join(this.root, toNative(path)), join(this.staging(release), 'bundle', toNative(path))))) {
          plan.keepLocal.push(path)
        }
      } else {
        plan.copy.push(path)
      }
    }
    for (const folder of rules.prune) {
      for (const path of await listFiles(this.root, folder)) {
        if (!(path in files)) {
          plan.remove.push(path)
        }
      }
    }
    for (const [path, entry] of Object.entries(navmesh)) {
      const target = join(this.root, toNative(path))
      const size = await stat(target).then((info) => info.size, () => -1)
      if (size !== entry.size || (await sha256Of(target)) !== entry.sha256) {
        plan.navmesh.push(path)
      }
    }
    return plan
  }

  /** The navmesh files the plan needs, each from the release that carries it, gunzipped and checked. */
  async fetchNavmesh(release: ServerRelease, plan: UpdatePlan, progress: Progress): Promise<void> {
    const entries = plan.navmesh.map((path) => [path, release.manifest.navmesh[path]!] as const)
    const total = entries.reduce((sum, [, entry]) => sum + entry.size, 0)
    let done = 0
    for (const [path, entry] of entries) {
      const target = join(this.staging(release), 'navmesh', toNative(path))
      const url = this.feed.assetUrl(entry.release, entry.asset)
      const step: Progress = (percent) => progress(total > 0 ? Math.floor(((done + (entry.size * percent) / 100) * 100) / total) : 100)
      await downloadChecked(url, target, entry.sha256, entry.size, step, true)
      done += entry.size
    }
  }

  /**
   * Puts the release in place. The record of what it does is written before anything moves, so an update stopped half-way (a crash, a full
   * disk) can still be undone; every file replaced or removed is moved into the backup, not deleted.
   */
  async apply(release: ServerRelease, plan: UpdatePlan, from: string | null): Promise<void> {
    const staging = this.staging(release)
    const backup = join(this.root, BACKUPS, `${from ?? 'git'}-to-${release.tag}`)
    await rm(backup, { recursive: true, force: true })
    // what goes where: [the path in the install, the file it comes from]
    const installs: [string, string][] = [
      ...plan.copy.map((path): [string, string] => [path, join(staging, 'bundle', toNative(path))]),
      ...plan.keepLocal.map((path): [string, string] => [`${path}.new-${release.tag}`, join(staging, 'bundle', toNative(path))]),
      ...plan.navmesh.map((path): [string, string] => [path, join(staging, 'navmesh', toNative(path))])
    ]
    const record: UndoRecord = { from, to: release.tag, at: new Date().toISOString(), replaced: [], added: [] }
    for (const [path] of installs) {
      ;((await exists(join(this.root, toNative(path)))) ? record.replaced : record.added).push(path)
    }
    record.replaced.push(...plan.remove)
    ;((await exists(join(this.root, 'manifest.json'))) ? record.replaced : record.added).push('manifest.json')
    await mkdir(backup, { recursive: true })
    await writeFile(join(backup, 'restore.json'), JSON.stringify(record, null, 2))

    for (const path of record.replaced) {
      if (path !== 'manifest.json') {
        await move(join(this.root, toNative(path)), join(backup, 'files', toNative(path)))
      }
    }
    await copyFile(join(this.root, 'manifest.json'), join(backup, 'files', 'manifest.json')).catch(() => undefined)
    for (const [path, source] of installs) {
      await move(source, join(this.root, toNative(path)))
    }
    const { bundle: _bundle, ...installed } = release.manifest
    await writeFile(join(this.root, 'manifest.json'), `${JSON.stringify(installed, null, 2)}\n`)
    await rm(join(this.root, STAGING), { recursive: true, force: true })
  }

  /**
   * The Java and the MySQL of the release (an install from nothing), each from the release that carries it, checked against the manifest's
   * hash, then unpacked into the staging folder. Throws when the release names no runtimes.
   */
  async fetchRuntimes(release: ServerRelease, progress: Progress): Promise<void> {
    const entries = runtimesOf(release.manifest)
    const total = entries.reduce((sum, entry) => sum + entry.size, 0)
    let done = 0
    for (const entry of entries) {
      const zip = join(this.staging(release), 'runtimes', entry.asset)
      const url = this.feed.assetUrl(entry.release, entry.asset)
      await downloadChecked(url, zip, entry.sha256, entry.size, (percent) => progress(Math.floor(((done + (entry.size * percent) / 100) * 100) / total)))
      const unpacked = join(this.staging(release), 'runtimes', entry.target)
      await rm(unpacked, { recursive: true, force: true })
      await unzipAll(zip, unpacked)
      done += entry.size
    }
  }

  /**
   * Puts a release into an empty folder: the runtimes, the bundle and the maps, then the manifest. No backup and no way back, there is nothing
   * to put back; a failure leaves the staging folder, and the next try downloads only what it lacks.
   */
  async installFresh(release: ServerRelease, plan: UpdatePlan): Promise<void> {
    const staging = this.staging(release)
    for (const entry of runtimesOf(release.manifest)) {
      const target = join(this.root, entry.target)
      await rm(target, { recursive: true, force: true })
      await move(join(staging, 'runtimes', entry.target), target)
    }
    for (const path of plan.copy) {
      await move(join(staging, 'bundle', toNative(path)), join(this.root, toNative(path)))
    }
    for (const path of plan.navmesh) {
      await move(join(staging, 'navmesh', toNative(path)), join(this.root, toNative(path)))
    }
    const { bundle: _bundle, ...installed } = release.manifest
    await writeFile(join(this.root, 'manifest.json'), `${JSON.stringify(installed, null, 2)}\n`)
    await rm(join(this.root, STAGING), { recursive: true, force: true })
  }

  /** The update that can be undone: the last one made, when its backup is still there. */
  async lastUpdate(): Promise<{ folder: string; record: UndoRecord } | null> {
    let names: string[]
    try {
      names = await readdir(join(this.root, BACKUPS))
    } catch {
      return null
    }
    let last: { folder: string; record: UndoRecord } | null = null
    for (const name of names) {
      try {
        const record = JSON.parse(await readFile(join(this.root, BACKUPS, name, 'restore.json'), 'utf8')) as UndoRecord
        if (!last || record.at > last.record.at) {
          last = { folder: join(this.root, BACKUPS, name), record }
        }
      } catch {
        // not an update's backup
      }
    }
    return last
  }

  /** Undoes the last update: what it created removed, what it replaced or removed put back, its backup then deleted. */
  async undo(): Promise<string | null> {
    const last = await this.lastUpdate()
    if (!last) {
      throw new Error('no update to undo')
    }
    const { folder, record } = last
    for (const path of record.added) {
      if (isSafePath(path)) {
        await rm(join(this.root, toNative(path)), { force: true })
      }
    }
    for (const path of record.replaced) {
      const kept = join(folder, 'files', toNative(path))
      if (isSafePath(path) && (await exists(kept))) {
        await move(kept, join(this.root, toNative(path)))
      }
    }
    await rm(folder, { recursive: true, force: true })
    return record.from
  }

  /** The bundle's SQL script run on the install's database (`tools/apply-sql.ps1`), from where the release put it. */
  sqlScript(): string {
    return join(this.root, 'tools', 'apply-sql.ps1')
  }

  /** The staged copy of the script, to ask the database before the update what it has had. */
  stagedSqlScript(release: ServerRelease): { script: string; sql: string } {
    const bundle = join(this.staging(release), 'bundle')
    return { script: join(bundle, 'tools', 'apply-sql.ps1'), sql: join(bundle, 'game-server', 'sql', 'update.sql') }
  }

  async discardStaging(): Promise<void> {
    await rm(join(this.root, STAGING), { recursive: true, force: true })
  }
}

export class CorruptError extends Error {}

/** The runtimes a release names, Java first; throws when it names neither (a release made before they were attached). */
export function runtimesOf(manifest: ReleaseManifest): RuntimeEntry[] {
  const entries = [manifest.runtimes?.java, manifest.runtimes?.mysql].filter((entry): entry is RuntimeEntry => entry !== undefined)
  if (entries.length !== 2) {
    throw new Error(`${manifest.version} carries no Java and MySQL to install from`)
  }
  return entries
}

/** Unpacks a whole zip, a runtime's: every entry, none that would land outside the folder. */
function unzipAll(zipPath: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error(`cannot open ${zipPath}`))
        return
      }
      zip.on('error', reject)
      zip.on('end', () => resolve())
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName
        if (name.endsWith('/')) {
          zip.readEntry()
          return
        }
        if (!isSafePath(name)) {
          zip.close()
          reject(new CorruptError(`${zipPath}: the entry ${name} would land outside its folder`))
          return
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`cannot read ${name}`))
            return
          }
          const file = join(target, toNative(name))
          mkdir(dirname(file), { recursive: true })
            .then(() => pipeline(stream, createWriteStream(file)))
            .then(() => zip.readEntry(), reject)
        })
      })
      zip.readEntry()
    })
  })
}

/** Unpacks the files the manifest names, and only those: a zip entry that is not in it, or would land outside the folder, is left out. */
function unzip(zipPath: string, target: string, manifest: ReleaseManifest): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('cannot open the bundle'))
        return
      }
      zip.on('error', reject)
      zip.on('end', () => resolve())
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName
        if (name.endsWith('/') || !isSafePath(name) || !(name in manifest.files)) {
          zip.readEntry()
          return
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`cannot read ${name}`))
            return
          }
          const file = join(target, toNative(name))
          mkdir(dirname(file), { recursive: true })
            .then(() => pipeline(stream, createWriteStream(file)))
            .then(() => zip.readEntry(), reject)
        })
      })
      zip.readEntry()
    })
  })
}

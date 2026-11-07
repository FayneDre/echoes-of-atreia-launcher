import { compareVersions } from '../../shared/types'
import { fetchGithubJson } from '../github/cachedJson'
import { parseReleaseManifest, type ReleaseManifest } from './manifest'

export const SERVER_REPOSITORY = 'FayneDre/aion-server-playerbots'
const LANGUAGES = ['en', 'fr'] as const

/** A server release that carries a bundle: what the launcher can install. */
export interface ServerRelease {
  tag: string
  prerelease: boolean
  manifest: ReleaseManifest
  bundleUrl: string
  /** The SHA-256 GitHub computed for the bundle when it was uploaded, when it gives one; the manifest's is checked too. */
  bundleDigest: string | null
  notes: Partial<Record<'en' | 'fr', string>>
}

interface ReleaseListing {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: { name: string; browser_download_url: string; digest?: string | null }[]
}

/**
 * The server's GitHub releases, or, for the end-to-end tests, a folder served over HTTP (`ECHOES_SERVER_FEED`) holding a `releases.json` of
 * the same shape as GitHub's answer and the assets under `<tag>/<name>`.
 */
export class ServerFeed {
  constructor(private readonly base = process.env['ECHOES_SERVER_FEED'] ?? null) {}

  private get listingUrl(): string {
    return this.base ? `${this.base}/releases.json` : `https://api.github.com/repos/${SERVER_REPOSITORY}/releases?per_page=30`
  }

  /** Where an asset of a release is, by name: what the navmesh entries of a manifest point to. */
  assetUrl(tag: string, name: string): string {
    return this.base ? `${this.base}/${tag}/${name}` : `https://github.com/${SERVER_REPOSITORY}/releases/download/${tag}/${name}`
  }

  /**
   * The newest release this launcher follows (a beta launcher the pre-releases too, a stable one the releases only) that carries a bundle and
   * a manifest it can read. Throws when the releases cannot be listed.
   */
  async newest(beta: boolean): Promise<ServerRelease | null> {
    const { body: listing } = await fetchGithubJson<ReleaseListing[]>(this.listingUrl)
    const candidates = listing
      .filter((release) => !release.draft && (beta || !release.prerelease) && compareVersions(release.tag_name, '0.0.0') !== null)
      .sort((a, b) => compareVersions(b.tag_name, a.tag_name)!)
    for (const release of candidates) {
      const asset = (name: string): ReleaseListing['assets'][number] | undefined => release.assets.find((candidate) => candidate.name === name)
      const manifestAsset = asset('manifest.json')
      if (!manifestAsset) {
        continue
      }
      const manifest = parseReleaseManifest(await (await fetch(manifestAsset.browser_download_url)).text())
      const bundle = manifest?.bundle ? asset(manifest.bundle.name) : undefined
      if (!manifest || manifest.version !== release.tag_name || !bundle) {
        continue
      }
      const notes: ServerRelease['notes'] = {}
      for (const language of LANGUAGES) {
        const notesAsset = asset(`notes.${language}.md`)
        if (notesAsset) {
          try {
            const answer = await fetch(notesAsset.browser_download_url)
            if (answer.ok) {
              notes[language] = await answer.text()
            }
          } catch {
            // the release stays, without its notes
          }
        }
      }
      const digest = bundle.digest?.startsWith('sha256:') ? bundle.digest.slice('sha256:'.length) : null
      return { tag: release.tag_name, prerelease: release.prerelease, manifest, bundleUrl: bundle.browser_download_url, bundleDigest: digest, notes }
    }
    return null
  }
}

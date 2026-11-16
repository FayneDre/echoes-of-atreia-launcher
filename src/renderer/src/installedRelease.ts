import type { NewsItem, NewsSource } from '../../shared/types'

/** The version installed of each source (`0.3.0-beta.13`, `v0.1.0-beta.8`): its release is marked "installed" rather than offered. */
export type InstalledVersions = Partial<Record<NewsSource, string | null>>

/** Whether this release is the one installed: a version written with its `v` or without. */
export function isInstalled(item: Pick<NewsItem, 'source' | 'tag'>, installed: InstalledVersions): boolean {
  const version = installed[item.source]
  return !!version && item.tag.replace(/^v/, '') === version.replace(/^v/, '')
}

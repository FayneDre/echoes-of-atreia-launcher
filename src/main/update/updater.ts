import { EventEmitter } from 'node:events'
import { app } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { isBetaVersion, type UpdateState } from '../../shared/types'

const REPOSITORY = 'https://github.com/FayneDre/echoes-of-atreia-launcher'
const LANGUAGES = ['en', 'fr'] as const

/**
 * The launcher updates itself from its GitHub releases (`build.publish` in package.json, read from the installer's app-update.yml): a beta
 * follows the pre-releases, a stable one only the releases, decided by its own version, with no setting. It checks at start, then every few
 * hours; a newer version downloads in the background and installs when the launcher closes, which the person can ask for at once. Closing
 * goes through the window's usual question when servers run, so an update never stops a server by itself, and nothing is offered while a
 * start or a stop is under way.
 *
 * The portable build cannot replace itself: it only says a newer version exists and where. A development run does not update at all,
 * unless the end-to-end tests give a feed (`ECHOES_UPDATE_FEED`, a folder served over HTTP with a latest.yml, as a release carries).
 */
export class LauncherUpdater extends EventEmitter<{ state: [UpdateState] }> {
  private state: UpdateState = { status: 'off' }
  private readonly feed = process.env['ECHOES_UPDATE_FEED']
  private readonly portable = Boolean(process.env['PORTABLE_EXECUTABLE_DIR'])
  private installAsked = false

  get current(): UpdateState {
    return this.state
  }

  private started = false

  /** Checks once, at the launcher's start: the start is what finds an update. Not in the developer mode, which never asks GitHub. */
  start(developer: boolean): void {
    if (this.started || developer || (!app.isPackaged && !this.feed)) {
      return
    }
    this.started = true
    autoUpdater.allowPrerelease = isBetaVersion(app.getVersion())
    autoUpdater.autoDownload = !this.portable
    autoUpdater.autoInstallOnAppQuit = !this.portable
    if (this.feed) {
      autoUpdater.forceDevUpdateConfig = true
      autoUpdater.setFeedURL({ provider: 'generic', url: this.feed })
      // the app-update.yml a development run has none of: it names the download's cache folder
      const config = process.env['ECHOES_UPDATE_CONFIG']
      if (config) {
        autoUpdater.updateConfigPath = config
      }
    }
    autoUpdater.on('update-available', (info) => {
      if (this.portable) {
        this.set({ status: 'portable', version: info.version, releaseUrl: `${REPOSITORY}/releases/tag/v${info.version}` })
      } else {
        this.set({ status: 'downloading', version: info.version, percent: 0 })
      }
      void this.fetchNotes(info)
    })
    autoUpdater.on('download-progress', (progress) => {
      if (this.state.status === 'downloading') {
        this.set({ ...this.state, percent: Math.floor(progress.percent) })
      }
    })
    autoUpdater.on('update-downloaded', (info) => this.set({ ...this.state, status: 'ready', version: info.version, percent: 100 }))
    // Offline, GitHub unreachable, no release yet: the launcher works on as it is, and tries again at the next check.
    autoUpdater.on('error', (error) => {
      console.warn('Update check failed:', error.message)
      if (this.state.status === 'downloading') {
        this.set({ status: 'idle' })
      }
    })
    this.set({ status: 'idle' })
    void this.check()
  }

  /**
   * The person asked to install now: the caller closes the window the usual way, which asks what to do with running servers, and the
   * installer runs only once the launcher really quits ({@link installIfAsked}). `quitAndInstall` itself starts the installer before
   * quitting, while a window that asks would still be open. Only once the update is downloaded.
   */
  askInstall(): boolean {
    if (this.state.status !== 'ready') {
      return false
    }
    this.installAsked = true
    return true
  }

  /** Called as the launcher quits: installs the update the person asked for, and opens the launcher again after it. */
  installIfAsked(): void {
    if (this.installAsked && this.state.status === 'ready') {
      this.installAsked = false
      autoUpdater.quitAndInstall(true, true)
    }
  }

  /** The person changed their mind at the window's question: the update waits for the next close, without opening again. */
  cancelInstall(): void {
    this.installAsked = false
  }

  private async check(): Promise<void> {
    if (this.state.status !== 'idle') {
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // reported by the 'error' event
    }
  }

  /** The two notes files a release carries; the interface shows the one of its language. */
  private async fetchNotes(info: UpdateInfo): Promise<void> {
    const notes: Partial<Record<'en' | 'fr', string>> = {}
    for (const language of LANGUAGES) {
      const base = this.feed ? this.feed.replace(/\/$/, '') : `${REPOSITORY}/releases/download/v${info.version}`
      try {
        const response = await fetch(`${base}/notes.${language}.md`)
        if (response.ok) {
          notes[language] = await response.text()
        }
      } catch {
        // the update stays, without its notes
      }
    }
    if (this.state.version === info.version) {
      this.set({ ...this.state, notes })
    }
  }

  private set(state: UpdateState): void {
    this.state = state
    this.emit('state', state)
  }
}

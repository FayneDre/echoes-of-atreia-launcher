import { Menu, nativeImage, Tray, type BrowserWindow, type NativeImage } from 'electron'
import { SERVER_IDS, stackPhase, type LauncherState, type ServerUpdateState, type StackPhase } from '../shared/types'

/** The dot over the taskbar's icon: green when one can play, red when a server failed, amber for anything between; none when stopped. */
export type TaskbarMark = 'ready' | 'busy' | 'failed' | null

export interface TaskbarStatus {
  phase: StackPhase
  mark: TaskbarMark
  /** The taskbar's own progress bar: a share from 0 to 1, moving without a share, or none. */
  progress: number | 'indeterminate' | null
}

export function taskbarStatus(state: LauncherState, update: ServerUpdateState | null): TaskbarStatus {
  const phase = stackPhase(state)
  const mark: TaskbarMark = phase === 'ready' || phase === 'failed' ? phase : phase === 'stopped' ? null : 'busy'
  let progress: TaskbarStatus['progress'] = null
  if (update && (update.status === 'preparing' || update.status === 'installing')) {
    progress = update.percent !== undefined ? Math.min(1, Math.max(0, update.percent / 100)) : 'indeterminate'
  } else if (state.activity === 'backup' || state.activity === 'restore' || state.activity === 'server-update') {
    progress = 'indeterminate'
  }
  return { phase, mark, progress }
}

/** The colours of the interface's own states (styles.css: --ok, --busy, --bad). */
const MARK_COLOURS: Record<Exclude<TaskbarMark, null>, [number, number, number]> = {
  ready: [0x5f, 0xdc, 0xb0],
  busy: [0xe3, 0xb8, 0x5f],
  failed: [0xef, 0x6b, 0x6b]
}

/**
 * A round dot with a dark ring, as raw BGRA pixels: no image file to ship, and sharp at the size Windows draws an overlay (16 points, here
 * drawn at twice that for high-density screens). The edge is smoothed over one pixel.
 */
export function dotPixels(colour: [number, number, number], size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4)
  const centre = (size - 1) / 2
  const outer = size / 2 - 0.5
  const ring = Math.max(1.5, size / 10)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - centre, y - centre)
      const alpha = Math.min(1, Math.max(0, outer - distance + 0.5))
      if (alpha === 0) {
        continue
      }
      const [red, green, blue] = distance > outer - ring ? [8, 12, 26] : colour
      const offset = (y * size + x) * 4
      pixels[offset] = blue
      pixels[offset + 1] = green
      pixels[offset + 2] = red
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }
  return pixels
}

const marks = new Map<Exclude<TaskbarMark, null>, NativeImage>()

function markImage(mark: Exclude<TaskbarMark, null>): NativeImage {
  let image = marks.get(mark)
  if (!image) {
    image = nativeImage.createFromBitmap(dotPixels(MARK_COLOURS[mark], 32), { width: 32, height: 32, scaleFactor: 2 })
    marks.set(mark, image)
  }
  return image
}

export type TrayLanguage = 'fr' | 'en'

const TEXTS: Record<TrayLanguage, Record<StackPhase | 'open' | 'play' | 'start' | 'stop' | 'quit', string>> = {
  fr: {
    ready: 'Serveurs prêts',
    failed: 'Un serveur a échoué',
    starting: 'Démarrage des serveurs…',
    stopping: 'Arrêt des serveurs…',
    updating: 'Mise à jour du serveur…',
    partial: 'Serveurs en partie démarrés',
    stopped: 'Serveurs arrêtés',
    open: 'Ouvrir le launcher',
    play: 'Jouer',
    start: 'Démarrer les serveurs',
    stop: 'Arrêter les serveurs',
    quit: 'Quitter'
  },
  en: {
    ready: 'Servers ready',
    failed: 'A server failed',
    starting: 'Starting the servers…',
    stopping: 'Stopping the servers…',
    updating: 'Updating the server…',
    partial: 'Servers partly started',
    stopped: 'Servers stopped',
    open: 'Open the launcher',
    play: 'Play',
    start: 'Start the servers',
    stop: 'Stop the servers',
    quit: 'Quit'
  }
}

export interface TrayActions {
  /** Brings the window to the front, or opens one when the launcher runs in the background. */
  open: () => void
  play: () => void
  start: () => void
  stop: () => void
  /** Shows the window and closes it as its own button would: running servers are asked about first. */
  quit: () => void
}

/**
 * Where the stack stands without opening the window: the dot over the taskbar's icon, its progress bar, and the icon in the notification
 * area, which keeps the launcher (and the servers it watches) when the window is put in the background.
 */
export class TaskbarPresence {
  private tray: Tray | null = null
  private language: TrayLanguage = 'fr'
  private state: LauncherState | null = null
  private update: ServerUpdateState | null = null
  private shown: string | null = null
  /** The window whose taskbar button shows the dot and the progress; none while the launcher runs in the background. */
  private window: BrowserWindow | null = null

  constructor(
    private readonly icon: string,
    private readonly actions: TrayActions
  ) {}

  /** A new window: its taskbar button is drawn from the current state. */
  attach(window: BrowserWindow): void {
    this.window = window
    this.shown = null
    this.render()
  }

  /** The icon in the notification area, from the start: it is how a window put in the background comes back. */
  start(): void {
    this.tray = new Tray(this.icon)
    // a state that came before the icon was drawn on the overlay only: the menu is built now
    this.shown = null
    this.tray.setToolTip('Echoes of Atreia')
    this.tray.on('click', () => this.actions.open())
    this.render()
  }

  setLanguage(language: TrayLanguage): void {
    this.language = language
    this.render()
  }

  setState(state: LauncherState): void {
    this.state = state
    this.render()
  }

  setServerUpdate(update: ServerUpdateState): void {
    this.update = update
    this.render()
  }

  dispose(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private render(): void {
    if (!this.state) {
      return
    }
    const status = taskbarStatus(this.state, this.update)
    const texts = TEXTS[this.language]
    const { servers } = this.state
    // any server up, as the home's banner counts them: after a failure, the others may still need stopping
    const running = SERVER_IDS.some((id) => !['stopped', 'failed'].includes(servers[id].status) || servers[id].external)
    // the overlay and the menu are rebuilt only when what they show changes: the state is published at every log line's status check
    const key = JSON.stringify([status, this.language, this.state.activity, this.state.install.clientFound, running])
    if (key === this.shown) {
      return
    }
    this.shown = key
    // without a window, the menu alone: the window opened later is drawn on its arrival (attach)
    if (this.window && !this.window.isDestroyed()) {
      this.window.setOverlayIcon(status.mark ? markImage(status.mark) : null, status.mark ? texts[status.phase] : '')
      this.window.setProgressBar(status.progress === null ? -1 : status.progress === 'indeterminate' ? 2 : status.progress, {
        mode: status.progress === 'indeterminate' ? 'indeterminate' : status.progress === null ? 'none' : 'normal'
      })
    }
    if (!this.tray) {
      return
    }
    const idle = this.state.activity === 'idle'
    this.tray.setToolTip(`Echoes of Atreia — ${texts[status.phase]}`)
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: texts.open, click: this.actions.open },
        { type: 'separator' },
        { label: texts.play, enabled: status.phase === 'ready' && this.state.install.clientFound, click: this.actions.play },
        { label: texts.start, enabled: idle && status.phase !== 'ready', click: this.actions.start },
        { label: texts.stop, enabled: running && (idle || this.state.activity === 'starting'), click: this.actions.stop },
        { type: 'separator' },
        { label: texts.quit, click: this.actions.quit }
      ])
    )
  }
}

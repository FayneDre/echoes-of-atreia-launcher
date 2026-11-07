import type { BotSample } from '../../shared/types'

/** How long the history reaches back: the Bots page shows the last hour. */
export const HISTORY_SPAN_MS = 60 * 60 * 1000

/**
 * The bots in the world, counted at a fixed interval while the game server runs, for the last hour's curve. Kept in memory only: a launcher
 * started again starts a new curve, as it would after the server's own restart. A count that cannot be read (the game server not ready, the
 * database refusing) adds no point, and the curve shows a gap there.
 */
export class BotHistory {
  private samples: BotSample[] = []
  private timer: NodeJS.Timeout | null = null
  private reading = false

  constructor(
    private readonly count: () => Promise<{ elyos: number; asmodians: number } | null>,
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now
  ) {}

  start(): void {
    if (!this.timer) {
      void this.sample()
      this.timer = setInterval(() => void this.sample(), this.intervalMs)
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /** The points of the last hour, oldest first. */
  get current(): BotSample[] {
    const since = this.now() - HISTORY_SPAN_MS
    return this.samples.filter((sample) => sample.at >= since)
  }

  /** One count now; a count still being read is not asked twice. */
  async sample(): Promise<void> {
    if (this.reading) {
      return
    }
    this.reading = true
    try {
      const counted = await this.count()
      if (counted) {
        const at = this.now()
        this.samples = [...this.samples.filter((sample) => sample.at >= at - HISTORY_SPAN_MS), { at, ...counted }]
      }
    } catch {
      // a count that failed is a gap in the curve, nothing more
    } finally {
      this.reading = false
    }
  }
}

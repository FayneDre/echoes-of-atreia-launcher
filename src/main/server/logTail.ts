import { EventEmitter } from 'node:events'
import { open, stat } from 'node:fs/promises'

interface FileIdentity {
  ino: bigint
  birthtimeMs: number
}

/**
 * Follows a log file as the server writes it, and starts over when the server replaces it: each server moves its old console log aside
 * when it starts, so the file read is a new one with the same name. Emits `lines` with the complete lines read since the last poll.
 */
export class LogTail extends EventEmitter<{ lines: [string[]] }> {
  private offset = 0
  private identity: FileIdentity | null = null
  private remainder: Buffer = Buffer.alloc(0)
  private timer: NodeJS.Timeout | null = null
  private reading = false

  constructor(
    private readonly file: string,
    private readonly intervalMs = 500
  ) {
    super()
  }

  /** `fromEnd` skips what the file already holds: the lines of a previous run, when the launcher is about to start the server. */
  async start(fromEnd: boolean): Promise<void> {
    this.stop()
    this.offset = 0
    this.identity = null
    this.remainder = Buffer.alloc(0)
    if (fromEnd) {
      const current = await this.statFile()
      if (current) {
        this.identity = { ino: current.ino, birthtimeMs: current.birthtimeMs }
        this.offset = Number(current.size)
      }
    }
    await this.poll()
    this.timer = setInterval(() => void this.poll(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async statFile(): Promise<{ ino: bigint; birthtimeMs: number; size: bigint } | null> {
    try {
      const stats = await stat(this.file, { bigint: true })
      return { ino: stats.ino, birthtimeMs: Number(stats.birthtimeMs), size: stats.size }
    } catch {
      return null
    }
  }

  private async poll(): Promise<void> {
    if (this.reading) {
      return
    }
    this.reading = true
    try {
      const current = await this.statFile()
      if (!current) {
        return
      }
      const replaced =
        this.identity !== null && (current.ino !== this.identity.ino || current.birthtimeMs !== this.identity.birthtimeMs)
      if (replaced || Number(current.size) < this.offset) {
        this.offset = 0
        this.remainder = Buffer.alloc(0)
      }
      this.identity = { ino: current.ino, birthtimeMs: current.birthtimeMs }

      const size = Number(current.size)
      if (size <= this.offset) {
        return
      }
      const chunk = Buffer.alloc(size - this.offset)
      const handle = await open(this.file, 'r')
      try {
        await handle.read(chunk, 0, chunk.length, this.offset)
      } finally {
        await handle.close()
      }
      this.offset = size
      this.emitLines(Buffer.concat([this.remainder, chunk]))
    } catch {
      // The server may be moving the file at this very moment: the next poll sees the new one.
    } finally {
      this.reading = false
    }
  }

  // Splits on the last newline byte, so a character cut in two by the end of the read is decoded once whole.
  private emitLines(data: Buffer): void {
    const lastNewline = data.lastIndexOf(0x0a)
    if (lastNewline < 0) {
      this.remainder = data
      return
    }
    this.remainder = data.subarray(lastNewline + 1)
    const lines = data
      .subarray(0, lastNewline)
      .toString('utf8')
      .split('\n')
      .map((line) => line.replace(/\r$/, ''))
    if (lines.length > 0) {
      this.emit('lines', lines)
    }
  }
}

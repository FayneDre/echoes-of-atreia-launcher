import { createReadStream } from 'node:fs'
import { EventEmitter } from 'node:events'
import { open, stat } from 'node:fs/promises'

interface FileIdentity {
  ino: bigint
  birthtimeMs: number
}

/** How much of a file already there is shown when following starts with `recent`: a log rolls at 100 MB, far too much to read whole. */
const RECENT_BYTES = 256 * 1024

/** Where following starts: after what the file holds (`end`), or at its last lines (`recent`). */
export type TailStart = 'end' | 'recent'

/** Whether a file contains a text, read in chunks so a log of any size costs no more memory than one chunk. */
export function fileMentions(file: string, text: string): Promise<boolean> {
  const needle = Buffer.from(text, 'utf8')
  return new Promise((resolve) => {
    let carry: Buffer = Buffer.alloc(0)
    const stream = createReadStream(file)
    stream.on('data', (chunk) => {
      const data = Buffer.concat([carry, chunk as Buffer])
      if (data.includes(needle)) {
        stream.destroy()
        resolve(true)
        return
      }
      // The end of a chunk is kept, in case the text is cut in two between this chunk and the next.
      carry = data.subarray(Math.max(0, data.length - needle.length + 1))
    })
    stream.on('end', () => resolve(false))
    stream.on('error', () => resolve(false))
  })
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
  // Set when reading starts in the middle of a file: the first line read is the end of a line cut in two.
  private dropPartialLine = false

  constructor(
    private readonly file: string,
    private readonly intervalMs = 500
  ) {
    super()
  }

  /**
   * `end` skips what the file already holds: the lines of a previous run, when the launcher is about to start the server. `recent` shows
   * the last lines of a server found running.
   */
  async start(from: TailStart): Promise<void> {
    this.stop()
    this.offset = 0
    this.identity = null
    this.remainder = Buffer.alloc(0)
    this.dropPartialLine = false
    const current = await this.statFile()
    if (current) {
      this.identity = { ino: current.ino, birthtimeMs: current.birthtimeMs }
      const size = Number(current.size)
      this.offset = from === 'end' ? size : Math.max(0, size - RECENT_BYTES)
      this.dropPartialLine = from === 'recent' && this.offset > 0
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
        this.dropPartialLine = false
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
    if (this.dropPartialLine) {
      lines.shift()
      this.dropPartialLine = false
    }
    if (lines.length > 0) {
      this.emit('lines', lines)
    }
  }
}

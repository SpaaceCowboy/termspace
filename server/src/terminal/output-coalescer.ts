import type { VisibilityLevel } from '@termspace/contracts'
import { z } from 'zod'

/**
 * How long output is allowed to pool before it is sent, per visibility.
 *
 * A pane nobody is looking at still has to stay correct, but it does not have
 * to stay smooth: a 250 ms flush costs a hidden pane nothing a person can
 * perceive and takes roughly a sixteenth of the frames off the socket. The
 * focused pane keeps 16 ms because that is the one being read as it moves.
 */
export const COALESCE_INTERVALS_MS: Record<VisibilityLevel, number> = {
  focused: 16,
  visible: 50,
  hidden: 250,
}

/**
 * What a session is assumed to be until a `vis` frame says otherwise. A client
 * sends `vis` right after `sub`, but the first bytes can beat it, and guessing
 * `focused` there would mean the quiet majority of panes start expensive.
 */
export const DEFAULT_VISIBILITY: VisibilityLevel = 'visible'

export interface ScheduledTimer {
  cancel(): void
}

export interface TimerScheduler {
  set(delayMs: number, callback: () => void): ScheduledTimer
}

const defaultScheduler: TimerScheduler = {
  set: (delayMs, callback) => {
    const handle = setTimeout(callback, delayMs)
    return { cancel: () => clearTimeout(handle) }
  },
}

const NumericOptionsSchema = z.object({
  intervalMs: z.number().int().positive(),
  maxBytes: z.number().int().positive(),
})

interface OutputCoalescerOptions {
  readonly intervalMs: number
  readonly maxBytes: number
  readonly onFlush: (data: string) => void
  readonly onTruncated: () => void
  readonly scheduler: TimerScheduler
}

export class OutputCoalescer {
  #intervalMs: number
  readonly #maxBytes: number
  readonly #onFlush: (data: string) => void
  readonly #onTruncated: () => void
  readonly #scheduler: TimerScheduler
  #byteLength = 0
  #chunks: string[] = []
  #timer: ScheduledTimer | undefined
  #truncated = false

  constructor(options: OutputCoalescerOptions) {
    const numericOptions = NumericOptionsSchema.parse(options)
    this.#intervalMs = numericOptions.intervalMs
    this.#maxBytes = numericOptions.maxBytes
    this.#onFlush = options.onFlush
    this.#onTruncated = options.onTruncated
    this.#scheduler = options.scheduler
  }

  push(data: string): void {
    const nextByteLength = this.#byteLength + Buffer.byteLength(data, 'utf8')
    if (nextByteLength > this.#maxBytes) {
      this.#chunks = []
      this.#byteLength = 0
      this.#truncated = true
    } else if (!this.#truncated) {
      this.#chunks.push(data)
      this.#byteLength = nextByteLength
    }
    this.#schedule()
  }

  /**
   * Switches tier when a pane's visibility changes.
   *
   * The whole difficulty is what happens to output already buffered at the
   * moment of the switch, and the two directions are not symmetric:
   *
   * - **Becoming more visible** flushes immediately. Someone just focused this
   *   pane, so whatever is pooled is exactly what they are waiting to see, and
   *   holding it for the remainder of a 250 ms window would show a stale screen
   *   at the moment of maximum attention. It also makes rapid switching safe:
   *   cancel-and-reschedule would let a pane flipped back and forth starve,
   *   never reaching a deadline at all.
   *
   * - **Becoming less visible** leaves the pending timer alone. It fires early
   *   against the new tier, which costs one extra flush and never delays a
   *   byte; the next window uses the longer interval. Rescheduling instead
   *   would push already-buffered output further away for no gain.
   */
  setVisibility(level: VisibilityLevel): void {
    const nextIntervalMs = COALESCE_INTERVALS_MS[level]
    if (nextIntervalMs === this.#intervalMs) {
      return
    }
    const becomingMoreVisible = nextIntervalMs < this.#intervalMs
    this.#intervalMs = nextIntervalMs
    if (becomingMoreVisible && this.#timer !== undefined) {
      this.#timer.cancel()
      this.#flush()
    }
  }

  dispose(): void {
    if (this.#timer !== undefined) {
      this.#timer.cancel()
      this.#timer = undefined
    }
    this.#chunks = []
    this.#byteLength = 0
    this.#truncated = false
  }

  #schedule(): void {
    if (this.#timer === undefined) {
      this.#timer = this.#scheduler.set(this.#intervalMs, () => this.#flush())
    }
  }

  #flush(): void {
    this.#timer = undefined
    if (this.#truncated) {
      this.#onTruncated()
    } else if (this.#chunks.length > 0) {
      this.#onFlush(this.#chunks.join(''))
    }
    this.#chunks = []
    this.#byteLength = 0
    this.#truncated = false
  }
}

export function createOutputCoalescer(
  onFlush: (data: string) => void,
  onTruncated: () => void,
): OutputCoalescer {
  return new OutputCoalescer({
    intervalMs: COALESCE_INTERVALS_MS[DEFAULT_VISIBILITY],
    maxBytes: 64 * 1_024,
    onFlush,
    onTruncated,
    scheduler: defaultScheduler,
  })
}

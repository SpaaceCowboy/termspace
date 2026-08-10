import { z } from 'zod'

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
  readonly #intervalMs: number
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

export function createFocusedOutputCoalescer(
  onFlush: (data: string) => void,
  onTruncated: () => void,
): OutputCoalescer {
  return new OutputCoalescer({
    intervalMs: 16,
    maxBytes: 64 * 1_024,
    onFlush,
    onTruncated,
    scheduler: defaultScheduler,
  })
}

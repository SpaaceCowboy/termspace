import { z } from 'zod'

const OptionsSchema = z.object({
  maxAttempts: z.number().int().positive(),
  windowMs: z.number().int().positive(),
})

interface AttemptWindow {
  failures: number
  startedAt: number
}

export type RateLimitResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterMs: number }

export class LoginRateLimiter {
  readonly #attempts = new Map<string, AttemptWindow>()
  readonly #maxAttempts: number
  readonly #windowMs: number

  constructor(untrustedOptions: z.input<typeof OptionsSchema>) {
    const options = OptionsSchema.parse(untrustedOptions)
    this.#maxAttempts = options.maxAttempts
    this.#windowMs = options.windowMs
  }

  check(key: string, now: number = Date.now()): RateLimitResult {
    const attempt = this.#attempts.get(key)
    if (attempt === undefined || this.#hasExpired(attempt, now)) {
      if (attempt !== undefined) {
        this.#attempts.delete(key)
      }
      return { allowed: true }
    }
    if (attempt.failures < this.#maxAttempts) {
      return { allowed: true }
    }
    return {
      allowed: false,
      retryAfterMs: attempt.startedAt + this.#windowMs - now,
    }
  }

  recordFailure(key: string, now: number = Date.now()): void {
    const attempt = this.#attempts.get(key)
    if (attempt === undefined || this.#hasExpired(attempt, now)) {
      this.#attempts.set(key, { failures: 1, startedAt: now })
      return
    }
    attempt.failures += 1
  }

  reset(key: string): void {
    this.#attempts.delete(key)
  }

  #hasExpired(attempt: AttemptWindow, now: number): boolean {
    return now >= attempt.startedAt + this.#windowMs
  }
}

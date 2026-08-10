export const BACKOFF = {
  baseMs: 500,
  maxMs: 15_000,
  /** Full jitter: the delay is drawn from [0, exponential], not centred on it. */
  jitter: 1,
  maxAttempts: 12,
} as const

/**
 * `attempt` is 1 for the first retry. Full jitter rather than a fixed ramp so a
 * server restart does not bring every client back in the same millisecond.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const bounded = Math.max(1, Math.floor(attempt))
  const exponential = Math.min(BACKOFF.maxMs, BACKOFF.baseMs * 2 ** (bounded - 1))
  return Math.round(exponential * random())
}

export function hasGivenUp(attempt: number): boolean {
  return attempt > BACKOFF.maxAttempts
}

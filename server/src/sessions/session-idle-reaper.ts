import type { Session } from '@termspace/contracts'

export const SESSION_IDLE_REAPER_INTERVAL_MS = 60_000

interface ReapableSessionManager {
  list(): readonly Session[]
  find(sessionId: string): Session | null
  delete(sessionId: string): Promise<boolean>
}

export interface SessionIdleReaperOptions {
  readonly sessions: ReapableSessionManager
  readonly graceMs: number
  readonly intervalMs?: number
  readonly now?: () => number
  readonly schedule?: (handler: () => void, delayMs: number) => () => void
  readonly onError?: (error: unknown) => void
}

/**
 * Removes sessions that have remained idle beyond the configured grace.
 *
 * Cleanup deliberately uses SessionManager.delete(): tmux scope collection,
 * worktree removal, dirty-worktree refusal, and row deletion must stay one
 * operation. A candidate is read again immediately before deletion so a state
 * change observed while an earlier candidate was being removed is respected.
 */
export class SessionIdleReaper {
  readonly #sessions: ReapableSessionManager
  readonly #graceMs: number
  readonly #intervalMs: number
  readonly #now: () => number
  readonly #schedule: (handler: () => void, delayMs: number) => () => void
  readonly #onError: (error: unknown) => void
  #cancel: (() => void) | null = null
  #disposed = false
  #started = false

  constructor(options: SessionIdleReaperOptions) {
    this.#sessions = options.sessions
    this.#graceMs = options.graceMs
    this.#intervalMs = options.intervalMs ?? SESSION_IDLE_REAPER_INTERVAL_MS
    this.#now = options.now ?? Date.now
    this.#schedule = options.schedule ?? schedule
    this.#onError = options.onError ?? (() => {})
  }

  start(): void {
    if (this.#disposed || this.#started) {
      return
    }
    this.#started = true
    void this.#runAndSchedule()
  }

  async reap(): Promise<void> {
    if (this.#disposed) {
      return
    }
    const cutoff = this.#now() - this.#graceMs
    const candidates = this.#sessions
      .list()
      .filter((session) => session.state === 'idle' && session.lastActivityAt <= cutoff)

    for (const candidate of candidates) {
      if (this.#disposed) {
        return
      }
      const current = this.#sessions.find(candidate.id)
      if (
        current === null ||
        current.state !== 'idle' ||
        current.lastActivityAt > cutoff
      ) {
        continue
      }
      try {
        await this.#sessions.delete(current.id)
      } catch (error) {
        // One dirty worktree or transient tmux failure must not prevent the
        // remaining eligible sessions from being considered.
        this.#onError(error)
      }
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#cancel?.()
    this.#cancel = null
  }

  async #runAndSchedule(): Promise<void> {
    try {
      await this.reap()
    } catch (error) {
      this.#onError(error)
    }
    if (this.#disposed) {
      return
    }
    this.#cancel = this.#schedule(() => {
      this.#cancel = null
      void this.#runAndSchedule()
    }, this.#intervalMs)
  }
}

function schedule(handler: () => void, delayMs: number): () => void {
  const timer = setTimeout(handler, delayMs)
  timer.unref?.()
  return () => {
    clearTimeout(timer)
  }
}

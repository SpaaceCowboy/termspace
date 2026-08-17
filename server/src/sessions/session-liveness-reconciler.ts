import type { Session } from '@termspace/contracts'

import type { SessionActivityTracker } from '../activity/activity-tracker.js'

export const SESSION_LIVENESS_INTERVAL_MS = 5_000

interface SessionReader {
  list(): readonly Session[]
}

interface TmuxSessionReader {
  listSessionIds(): Promise<ReadonlySet<string>>
}

export interface SessionLivenessReconcilerOptions {
  readonly activity: SessionActivityTracker
  readonly sessions: SessionReader
  readonly tmux: TmuxSessionReader
  readonly intervalMs?: number
  readonly schedule?: (handler: () => void, delayMs: number) => () => void
  readonly onError?: (error: unknown) => void
}

/**
 * Reconciles durable database rows with the process tmux actually owns.
 *
 * A viewer attachment already detects exits while somebody is watching. This
 * covers the other case: a command exits with every browser closed, tmux drops
 * the session, and the persisted row would otherwise remain idle forever.
 */
export class SessionLivenessReconciler {
  readonly #activity: SessionActivityTracker
  readonly #sessions: SessionReader
  readonly #tmux: TmuxSessionReader
  readonly #intervalMs: number
  readonly #schedule: (handler: () => void, delayMs: number) => () => void
  readonly #onError: (error: unknown) => void
  #cancel: (() => void) | null = null
  #disposed = false
  #started = false

  constructor(options: SessionLivenessReconcilerOptions) {
    this.#activity = options.activity
    this.#sessions = options.sessions
    this.#tmux = options.tmux
    this.#intervalMs = options.intervalMs ?? SESSION_LIVENESS_INTERVAL_MS
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

  async reconcile(): Promise<void> {
    if (this.#disposed) {
      return
    }
    // Snapshot rows first. A session created after this point is deliberately
    // absent from this pass, avoiding a race where its tmux session starts just
    // after the tmux snapshot and is falsely declared dead.
    const persisted = this.#sessions.list()
    if (persisted.length === 0) {
      return
    }
    const liveIds = await this.#tmux.listSessionIds()
    if (this.#disposed) {
      return
    }
    for (const session of persisted) {
      if (liveIds.has(session.id)) {
        continue
      }
      this.#activity.register(session.id, session.agent, session.state)
      this.#activity.markDead(session.id)
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#cancel?.()
    this.#cancel = null
  }

  async #runAndSchedule(): Promise<void> {
    try {
      await this.reconcile()
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

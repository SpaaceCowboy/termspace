import type { AgentKind, SessionState } from '@termspace/contracts'

import { matchesPrompt } from './patterns.js'

/** Output within this window means the session is working. */
export const WORKING_WINDOW_MS = 3_000

export interface ActivityChange {
  readonly sessionId: string
  readonly state: SessionState
  /** When the session entered this state, so a client can render "for 4m". */
  readonly since: number
}

export type ActivityListener = (change: ActivityChange) => void

interface TrackedSession {
  agent: AgentKind
  state: SessionState
  since: number
  lastOutputAt: number
  /** Rolling tail of recent output, enough to hold the visible prompt. */
  tail: string
  timer: (() => void) | null
}

export interface ActivityTrackerOptions {
  readonly now?: () => number
  /** Injected so tests drive time instead of waiting for it. */
  readonly schedule?: (handler: () => void, delayMs: number) => () => void
  readonly onError?: (error: unknown) => void
}

/** Only the last part of the screen can hold the trailing line. */
const TAIL_LIMIT = 4_096

/**
 * Derives session state from output, and announces it only when it changes.
 *
 * State is a property of the session, not of a viewer, so one tracker is shared
 * by every connection: two browser tabs watching the same session must agree,
 * and the state must keep advancing while nobody is watching at all.
 *
 * There is a timer, but it is not a poll. Entering `working` is edge-triggered
 * by output; leaving it needs something to fire once, 3 s after the last byte,
 * to decide between `idle` and `needs-you`. That timer is reset by further
 * output and never emits unless the derived state actually differs.
 */
export class SessionActivityTracker {
  readonly #sessions = new Map<string, TrackedSession>()
  readonly #listeners = new Set<ActivityListener>()
  readonly #now: () => number
  readonly #schedule: (handler: () => void, delayMs: number) => () => void
  readonly #onError: (error: unknown) => void

  constructor(options: ActivityTrackerOptions = {}) {
    this.#now = options.now ?? Date.now
    this.#schedule =
      options.schedule ??
      ((handler, delayMs) => {
        const timer = setTimeout(handler, delayMs)
        timer.unref?.()
        return () => {
          clearTimeout(timer)
        }
      })
    this.#onError =
      options.onError ??
      (() => {
        // A listener that throws must not take the gateway down with it.
      })
  }

  listen(listener: ActivityListener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Seeds a session without announcing anything. Called when a session starts
   * or is first attached to, so its agent kind is known before any output.
   */
  register(sessionId: string, agent: AgentKind, state: SessionState = 'idle'): void {
    const existing = this.#sessions.get(sessionId)
    if (existing !== undefined) {
      existing.agent = agent
      return
    }
    this.#sessions.set(sessionId, {
      agent,
      state,
      since: this.#now(),
      lastOutputAt: 0,
      tail: '',
      timer: null,
    })
  }

  state(sessionId: string): SessionState | null {
    return this.#sessions.get(sessionId)?.state ?? null
  }

  /** State plus when it was entered, for a client that has just subscribed. */
  snapshot(sessionId: string): { state: SessionState; since: number } | null {
    const tracked = this.#sessions.get(sessionId)
    return tracked === undefined ? null : { state: tracked.state, since: tracked.since }
  }

  /** Every byte the session produces passes through here. */
  observe(sessionId: string, data: string): void {
    const tracked = this.#sessions.get(sessionId)
    if (tracked === undefined) {
      return
    }
    tracked.lastOutputAt = this.#now()
    tracked.tail = (tracked.tail + data).slice(-TAIL_LIMIT)

    this.#transition(sessionId, tracked, 'working')

    tracked.timer?.()
    tracked.timer = this.#schedule(() => {
      tracked.timer = null
      this.#settle(sessionId, tracked)
    }, WORKING_WINDOW_MS)
  }

  /** A session that exited is dead regardless of what its last line said. */
  markDead(sessionId: string): void {
    const tracked = this.#sessions.get(sessionId)
    if (tracked === undefined) {
      return
    }
    tracked.timer?.()
    tracked.timer = null
    this.#transition(sessionId, tracked, 'dead')
  }

  forget(sessionId: string): void {
    const tracked = this.#sessions.get(sessionId)
    tracked?.timer?.()
    this.#sessions.delete(sessionId)
  }

  dispose(): void {
    for (const tracked of this.#sessions.values()) {
      tracked.timer?.()
    }
    this.#sessions.clear()
    this.#listeners.clear()
  }

  /** The 3 s window has passed with no further output: idle, or a question. */
  #settle(sessionId: string, tracked: TrackedSession): void {
    if (tracked.state === 'dead') {
      return
    }
    const next: SessionState = matchesPrompt(tracked.agent, tracked.tail)
      ? 'needs-you'
      : 'idle'
    this.#transition(sessionId, tracked, next)
  }

  #transition(sessionId: string, tracked: TrackedSession, next: SessionState): void {
    if (tracked.state === next) {
      return
    }
    tracked.state = next
    tracked.since = this.#now()
    const change: ActivityChange = { sessionId, state: next, since: tracked.since }
    for (const listener of this.#listeners) {
      try {
        listener(change)
      } catch (error) {
        this.#onError(error)
      }
    }
  }
}

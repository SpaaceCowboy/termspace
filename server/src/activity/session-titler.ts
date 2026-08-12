import type { AgentKind } from '@termspace/contracts'

import type { ActivityChange } from './activity-tracker.js'
import { deriveTitle } from './title.js'

/**
 * How long after a session starts working to ask what it is doing.
 *
 * Not a poll and not a guess at how long work takes. An agent publishes the new
 * task title about a second into the turn, so sampling on the first byte of
 * output reliably reads the *previous* task's title and then shows it for the
 * whole run. Waiting a moment reads the new one. It is shorter than
 * `WORKING_WINDOW_MS` so the sample lands while the session is still working,
 * which is exactly when a person wants to know what it is up to.
 */
export const TITLE_SAMPLE_DELAY_MS = 2_000

export interface TitleChange {
  readonly sessionId: string
  readonly title: string
}

export type TitleListener = (change: TitleChange) => void

interface TrackedTitle {
  title: string | null
  timer: (() => void) | null
  /** Issued per sample so a slow read cannot overwrite a newer one. */
  sequence: number
}

export interface SessionTitlerOptions {
  /** Reads the pane title for a session. Injected so tests need no tmux. */
  readonly readTitle: (sessionId: string) => Promise<string>
  readonly hostname: string
  readonly schedule?: (handler: () => void, delayMs: number) => () => void
  readonly onError?: (error: unknown) => void
}

/**
 * Keeps each session's derived title current, and announces it only when it
 * changes.
 *
 * Deliberately separate from `SessionActivityTracker`: state is derived
 * synchronously from bytes already in hand, while a title comes from an async
 * call out to tmux that can fail. Folding the second into the first would put a
 * subprocess on the path of every status frame.
 *
 * It has a timer for the same reason the tracker does — one shot, edge
 * triggered, cancelled by the next edge. It never polls a quiet session.
 */
export class SessionTitler {
  readonly #sessions = new Map<string, TrackedTitle>()
  readonly #listeners = new Set<TitleListener>()
  readonly #readTitle: (sessionId: string) => Promise<string>
  readonly #hostname: string
  readonly #schedule: (handler: () => void, delayMs: number) => () => void
  readonly #onError: (error: unknown) => void

  constructor(options: SessionTitlerOptions) {
    this.#readTitle = options.readTitle
    this.#hostname = options.hostname
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
        // A tmux read that fails must not take the gateway down.
      })
  }

  listen(listener: TitleListener): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Seeds the title a session already has, without announcing it. Without this
   * a restarted gateway would re-announce every stored title as though it were
   * new, and clients would flash a change that did not happen.
   */
  register(sessionId: string, title: string | null): void {
    const existing = this.#sessions.get(sessionId)
    if (existing !== undefined) {
      return
    }
    this.#sessions.set(sessionId, { title, timer: null, sequence: 0 })
  }

  title(sessionId: string): string | null {
    return this.#sessions.get(sessionId)?.title ?? null
  }

  /** Wired to the activity tracker: every state change is a sampling edge. */
  observe(change: ActivityChange): void {
    const tracked = this.#sessions.get(change.sessionId)
    if (tracked === undefined) {
      return
    }
    tracked.timer?.()
    tracked.timer = null

    if (change.state === 'dead') {
      // Nothing is left to ask, and the last title it had is the useful one.
      return
    }
    if (change.state === 'working') {
      tracked.timer = this.#schedule(() => {
        tracked.timer = null
        void this.#sample(change.sessionId, change.agent)
      }, TITLE_SAMPLE_DELAY_MS)
      return
    }
    // Settled: the turn is over and the title it ended on is the final one.
    void this.#sample(change.sessionId, change.agent)
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

  async #sample(sessionId: string, agent: AgentKind): Promise<void> {
    const tracked = this.#sessions.get(sessionId)
    if (tracked === undefined) {
      return
    }
    tracked.sequence += 1
    const sequence = tracked.sequence
    let paneTitle: string
    try {
      paneTitle = await this.#readTitle(sessionId)
    } catch (error) {
      // A session that just died is the common case here, not a bug worth
      // failing on: it simply keeps the title it had.
      this.#onError(error)
      return
    }
    const live = this.#sessions.get(sessionId)
    if (live !== tracked || sequence !== tracked.sequence) {
      // Forgotten, or overtaken by a later sample while this read was in
      // flight. An older title must never win.
      return
    }
    const derived = deriveTitle(agent, paneTitle, { hostname: this.#hostname })
    if (derived === null || derived === tracked.title) {
      return
    }
    tracked.title = derived
    const change: TitleChange = { sessionId, title: derived }
    for (const listener of this.#listeners) {
      try {
        listener(change)
      } catch (error) {
        this.#onError(error)
      }
    }
  }
}

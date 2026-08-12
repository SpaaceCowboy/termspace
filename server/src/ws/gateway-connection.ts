import type { ServerFrame, Session, VisibilityLevel } from '@termspace/contracts'

import { encodeTerminalOutput } from './frame-codec.js'
import { decodeClientFrame } from './frame-codec.js'
import type { SessionActivityTracker } from '../activity/activity-tracker.js'
import type { SessionTitler } from '../activity/session-titler.js'
import type { SessionFeedCoordinator, SessionFeedLease } from './session-feed-coordinator.js'

export interface GatewayAttachment {
  close(): void
  resize(cols: number, rows: number): void
  write(data: string): void
}

export interface GatewayCoalescer {
  dispose(): void
  push(data: string): void
  setVisibility(level: VisibilityLevel): void
}

interface GatewaySubscription {
  readonly attachment: GatewayAttachment
  readonly coalescer: GatewayCoalescer
  readonly feedLease: SessionFeedLease
}

export interface GatewayConnectionDependencies {
  readonly sessions: { find(sessionId: string): Session | null }
  readonly attachments: {
    attach(
      sessionId: string,
      callbacks: {
        readonly onData: (data: string) => void
        readonly onExit: (event: { readonly exitCode: number }) => void
      },
    ): GatewayAttachment
  }
  readonly buffers: {
    restore(sessionId: string, capture: () => Promise<string>): Promise<string>
    write(sessionId: string, data: string): Promise<void>
  }
  readonly capture: (sessionId: string) => Promise<string>
  readonly feeds: SessionFeedCoordinator
  readonly activity: SessionActivityTracker
  readonly titles: SessionTitler
  readonly createCoalescer: (
    onFlush: (data: string) => void,
    onTruncated: () => void,
  ) => GatewayCoalescer
  readonly transport: {
    sendBinary(data: Buffer): void
    sendFrame(frame: ServerFrame): void
  }
  readonly onError: (error: unknown) => void
}

export class GatewayConnection {
  readonly #dependencies: GatewayConnectionDependencies
  readonly #subscriptions = new Map<string, GatewaySubscription>()
  readonly #stopListening: () => void
  readonly #stopListeningTitles: () => void
  #closed = false

  constructor(dependencies: GatewayConnectionDependencies) {
    this.#dependencies = dependencies
    this.#stopListeningTitles = dependencies.titles.listen((change) => {
      if (this.#closed || !this.#subscriptions.has(change.sessionId)) {
        return
      }
      this.#dependencies.transport.sendFrame({
        t: 'title',
        sid: change.sessionId,
        title: change.title,
      })
    })
    /*
     * One listener for the connection rather than one per subscription: state
     * belongs to the session, and a connection simply forwards the changes for
     * whatever it happens to be watching at the time.
     */
    this.#stopListening = dependencies.activity.listen((change) => {
      if (this.#closed || !this.#subscriptions.has(change.sessionId)) {
        return
      }
      this.#dependencies.transport.sendFrame({
        t: 'status',
        sid: change.sessionId,
        state: change.state,
        since: change.since,
      })
    })
  }

  async handleText(payload: string): Promise<void> {
    if (this.#closed) {
      return
    }
    const decoded = decodeClientFrame(payload)
    if (!decoded.ok) {
      this.#sendError(null, 'validation_failed', 'Invalid WebSocket frame.')
      return
    }

    const frame = decoded.frame
    switch (frame.t) {
      case 'sub':
        await this.#subscribe(frame.sid)
        return
      case 'unsub':
        this.#unsubscribe(frame.sid)
        return
      case 'in':
        this.#subscriptions.get(frame.sid)?.attachment.write(frame.data)
        return
      case 'resize':
        this.#subscriptions
          .get(frame.sid)
          ?.attachment.resize(frame.cols, frame.rows)
        return
      case 'vis':
        // Visibility is a property of this viewer, not of the session: two tabs
        // can watch the same session with only one of them focused, and each
        // gets its own flush cadence.
        this.#subscriptions.get(frame.sid)?.coalescer.setVisibility(frame.level)
        return
      case 'ping':
        this.#dependencies.transport.sendFrame({ t: 'pong' })
        return
    }
  }

  close(): void {
    if (this.#closed) {
      return
    }
    this.#closed = true
    this.#stopListening()
    this.#stopListeningTitles()
    for (const sessionId of [...this.#subscriptions.keys()]) {
      this.#unsubscribe(sessionId)
    }
  }

  async #subscribe(sessionId: string): Promise<void> {
    if (this.#subscriptions.has(sessionId)) {
      return
    }
    const session = this.#dependencies.sessions.find(sessionId)
    if (session === null) {
      this.#sendError(sessionId, 'session_not_found', 'Session was not found.')
      return
    }
    // The tracker needs the agent kind to know what a question looks like, and
    // the persisted state so a freshly started gateway does not claim every
    // session is idle before any output arrives.
    this.#dependencies.activity.register(sessionId, session.agent, session.state)
    // The stored title, so a restarted gateway does not re-announce it as new.
    this.#dependencies.titles.register(sessionId, session.title)

    let feedLease: SessionFeedLease | undefined
    let coalescer: GatewayCoalescer | undefined
    try {
      const restore = await this.#dependencies.buffers.restore(
        sessionId,
        () => this.#dependencies.capture(sessionId),
      )
      if (this.#closed) {
        return
      }
      this.#dependencies.transport.sendFrame({
        t: 'restore',
        sid: sessionId,
        data: restore,
      })
      // A client that subscribes mid-session must be told the state it is
      // already in; status frames are edge-triggered and the next edge could
      // be minutes away.
      const known = this.#dependencies.activity.snapshot(sessionId)
      if (known !== null) {
        this.#dependencies.transport.sendFrame({
          t: 'status',
          sid: sessionId,
          state: known.state,
          since: known.since,
        })
      }
      // Same reasoning as the status frame: title frames are edge-triggered, so
      // a client subscribing between two edges has to be told the current one.
      const knownTitle = this.#dependencies.titles.title(sessionId)
      if (knownTitle !== null) {
        this.#dependencies.transport.sendFrame({
          t: 'title',
          sid: sessionId,
          title: knownTitle,
        })
      }

      const acquiredFeedLease = this.#dependencies.feeds.acquire(sessionId)
      feedLease = acquiredFeedLease
      const outputCoalescer = this.#dependencies.createCoalescer(
        (data) => {
          this.#dependencies.transport.sendBinary(
            encodeTerminalOutput(sessionId, data),
          )
        },
        () => {
          this.#dependencies.transport.sendFrame({ t: 'truncated', sid: sessionId })
          void this.#resync(sessionId)
        },
      )
      coalescer = outputCoalescer
      let earlyExitCode: number | undefined
      const attachment = this.#dependencies.attachments.attach(sessionId, {
        onData: (data) => {
          if (acquiredFeedLease.isWriter()) {
            void this.#dependencies.buffers
              .write(sessionId, data)
              .catch(this.#dependencies.onError)
            // Only the writer observes, or every extra viewer would double-count
            // the same bytes into the same tracker.
            this.#dependencies.activity.observe(sessionId, data)
          }
          outputCoalescer.push(data)
        },
        onExit: ({ exitCode }) => {
          this.#dependencies.activity.markDead(sessionId)
          if (!this.#subscriptions.has(sessionId)) {
            earlyExitCode = exitCode
            return
          }
          this.#dependencies.transport.sendFrame({
            t: 'exit',
            sid: sessionId,
            code: exitCode,
          })
          this.#unsubscribe(sessionId)
        },
      })
      if (earlyExitCode !== undefined) {
        this.#dependencies.transport.sendFrame({
          t: 'exit',
          sid: sessionId,
          code: earlyExitCode,
        })
        attachment.close()
        outputCoalescer.dispose()
        acquiredFeedLease.release()
        return
      }
      this.#subscriptions.set(sessionId, {
        attachment,
        coalescer: outputCoalescer,
        feedLease: acquiredFeedLease,
      })
    } catch (error) {
      coalescer?.dispose()
      feedLease?.release()
      this.#dependencies.onError(error)
      this.#sendError(sessionId, 'internal_error', 'Unable to attach to session.')
    }
  }

  #unsubscribe(sessionId: string): void {
    const subscription = this.#subscriptions.get(sessionId)
    if (subscription === undefined) {
      return
    }
    this.#subscriptions.delete(sessionId)
    subscription.coalescer.dispose()
    subscription.feedLease.release()
    subscription.attachment.close()
  }

  async #resync(sessionId: string): Promise<void> {
    try {
      const data = await this.#dependencies.buffers.restore(
        sessionId,
        () => this.#dependencies.capture(sessionId),
      )
      if (this.#closed || !this.#subscriptions.has(sessionId)) {
        return
      }
      this.#dependencies.transport.sendFrame({
        t: 'restore',
        sid: sessionId,
        data,
      })
    } catch (error) {
      this.#dependencies.onError(error)
    }
  }

  #sendError(sid: string | null, code: string, message: string): void {
    this.#dependencies.transport.sendFrame({ t: 'error', sid, code, message })
  }
}

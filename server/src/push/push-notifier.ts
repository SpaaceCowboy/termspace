import type { Session } from '@termspace/contracts'

import type { PushSubscriptionRepository, StoredPushSubscription } from './push-repository.js'

/**
 * What lands in the notification. Deliberately small and free of output: a push
 * payload travels through a third-party push service, so it carries the fact
 * that a session wants attention and nothing about what the session is doing.
 */
export interface PushPayload {
  readonly title: string
  readonly body: string
  readonly sessionId: string
}

export interface PushSender {
  send(subscription: StoredPushSubscription, payload: string): Promise<PushSendResult>
}

export type PushSendResult =
  | { readonly outcome: 'sent' }
  /** The endpoint is permanently gone (404/410); stop trying it. */
  | { readonly outcome: 'expired' }
  | { readonly outcome: 'failed'; readonly error: unknown }

export interface PushNotifierOptions {
  readonly repository: PushSubscriptionRepository
  readonly sender: PushSender
  readonly now?: () => number
  readonly onError?: (error: unknown) => void
  readonly log?: (event: PushDeliveryLog) => void
}

/** Latency and outcome, never the payload. */
export interface PushDeliveryLog {
  readonly sessionId: string
  readonly attempted: number
  readonly sent: number
  readonly expired: number
  readonly failed: number
  readonly durationMs: number
}

export class PushNotifier {
  readonly #repository: PushSubscriptionRepository
  readonly #sender: PushSender
  readonly #now: () => number
  readonly #onError: (error: unknown) => void
  readonly #log: (event: PushDeliveryLog) => void

  constructor(options: PushNotifierOptions) {
    this.#repository = options.repository
    this.#sender = options.sender
    this.#now = options.now ?? Date.now
    this.#onError = options.onError ?? (() => undefined)
    this.#log = options.log ?? (() => undefined)
  }

  /**
   * Fans out to every device the user registered. One dead endpoint must not
   * stop the others, so every send is settled rather than raced, and an expired
   * endpoint is deleted rather than retried forever.
   */
  async notify(userId: string, session: Session): Promise<void> {
    const subscriptions = this.#repository.listForUser(userId)
    if (subscriptions.length === 0) {
      return
    }

    const payload: PushPayload = {
      title: `${session.name} needs you`,
      body:
        session.title === null
          ? 'The session is waiting for an answer.'
          : session.title,
      sessionId: session.id,
    }
    const body = JSON.stringify(payload)
    const startedAt = this.#now()

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          return await this.#sender.send(subscription, body)
        } catch (error) {
          return { outcome: 'failed', error } as const
        }
      }),
    )

    let sent = 0
    let expired = 0
    let failed = 0
    for (const [index, result] of results.entries()) {
      const subscription = subscriptions[index]
      if (subscription === undefined) {
        continue
      }
      switch (result.outcome) {
        case 'sent':
          sent += 1
          this.#safely(() => this.#repository.markUsed(subscription.endpoint, this.#now()))
          break
        case 'expired':
          expired += 1
          this.#safely(() => this.#repository.deleteByEndpoint(subscription.endpoint))
          break
        case 'failed':
          failed += 1
          this.#onError(result.error)
          break
      }
    }

    this.#log({
      sessionId: session.id,
      attempted: subscriptions.length,
      sent,
      expired,
      failed,
      durationMs: this.#now() - startedAt,
    })
  }

  /** Every subscribed user. See `listSubscribedUserIds` for why this is right. */
  async notifyAll(session: Session): Promise<void> {
    for (const userId of this.#repository.listSubscribedUserIds()) {
      await this.notify(userId, session)
    }
  }

  #safely(action: () => void): void {
    try {
      action()
    } catch (error) {
      this.#onError(error)
    }
  }
}

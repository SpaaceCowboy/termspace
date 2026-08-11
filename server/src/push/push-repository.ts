import type { PushSubscriptionInput } from '@termspace/contracts'
import type Database from 'better-sqlite3'
import { z } from 'zod'

export interface StoredPushSubscription {
  readonly endpoint: string
  readonly userId: string
  readonly keys: { readonly p256dh: string; readonly auth: string }
}

const RowSchema = z
  .object({
    endpoint: z.string(),
    user_id: z.string(),
    p256dh: z.string(),
    auth: z.string(),
  })
  .transform(
    (row): StoredPushSubscription => ({
      endpoint: row.endpoint,
      userId: row.user_id,
      keys: { p256dh: row.p256dh, auth: row.auth },
    }),
  )

export class PushSubscriptionRepository {
  readonly #database: Database.Database

  constructor(database: Database.Database) {
    this.#database = database
  }

  /**
   * An upsert on `endpoint`, because a browser re-subscribing produces the same
   * endpoint and must not accumulate rows. Re-registering also moves it to the
   * current user, which matters if two people ever share a device.
   */
  save(userId: string, subscription: PushSubscriptionInput, now: number): void {
    this.#database
      .prepare(
        `INSERT INTO push_subscriptions
           (endpoint, user_id, p256dh, auth, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(endpoint) DO UPDATE SET
           user_id = excluded.user_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth`,
      )
      .run(
        subscription.endpoint,
        userId,
        subscription.keys.p256dh,
        subscription.keys.auth,
        now,
      )
  }

  listForUser(userId: string): readonly StoredPushSubscription[] {
    return z
      .array(RowSchema)
      .parse(
        this.#database
          .prepare(
            'SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
          )
          .all(userId),
      )
  }

  /**
   * Sessions have no owner in the schema — this is a single-operator app with
   * no registration — so a session wanting attention notifies everyone who has
   * asked to be notified. If sessions ever gain an owner, this is the seam that
   * has to narrow.
   */
  listSubscribedUserIds(): readonly string[] {
    return z
      .array(z.object({ user_id: z.string() }))
      .parse(
        this.#database.prepare('SELECT DISTINCT user_id FROM push_subscriptions').all(),
      )
      .map((row) => row.user_id)
  }

  countForUser(userId: string): number {
    const row = this.#database
      .prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE user_id = ?')
      .get(userId)
    return z.object({ count: z.number().int() }).parse(row).count
  }

  /** Scoped to the user so one account cannot unsubscribe another's device. */
  delete(userId: string, endpoint: string): boolean {
    return (
      this.#database
        .prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
        .run(userId, endpoint).changes > 0
    )
  }

  /**
   * Used when the push service reports an endpoint is gone. Not scoped to a
   * user: the push service is telling us this endpoint is dead for everyone.
   */
  deleteByEndpoint(endpoint: string): void {
    this.#database.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
  }

  markUsed(endpoint: string, now: number): void {
    this.#database
      .prepare('UPDATE push_subscriptions SET last_used_at = ? WHERE endpoint = ?')
      .run(now, endpoint)
  }
}

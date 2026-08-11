import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionFixture } from '@termspace/contracts'

import type { PushDeliveryLog, PushSendResult, PushSender } from './push-notifier.js'
import { PushNotifier } from './push-notifier.js'
import type { StoredPushSubscription } from './push-repository.js'

const USER = 'usr_operator'

function subscription(endpoint: string): StoredPushSubscription {
  return { endpoint, userId: USER, keys: { p256dh: 'p', auth: 'a' } }
}

class FakeRepository {
  subscriptions: StoredPushSubscription[] = []
  readonly deleted: string[] = []
  readonly used: string[] = []

  listForUser(): readonly StoredPushSubscription[] {
    return this.subscriptions
  }

  listSubscribedUserIds(): readonly string[] {
    return this.subscriptions.length === 0 ? [] : [USER]
  }

  deleteByEndpoint(endpoint: string): void {
    this.deleted.push(endpoint)
    this.subscriptions = this.subscriptions.filter((entry) => entry.endpoint !== endpoint)
  }

  markUsed(endpoint: string): void {
    this.used.push(endpoint)
  }

  /** A method, not an assignment: assigning would narrow the field. */
  setSubscriptions(next: StoredPushSubscription[]): void {
    this.subscriptions = next
  }
}

function build(results: Record<string, PushSendResult | 'throw'>) {
  const repository = new FakeRepository()
  const payloads: string[] = []
  const errors: unknown[] = []
  const logs: PushDeliveryLog[] = []
  const sender: PushSender = {
    send: async (target, payload) => {
      payloads.push(payload)
      const result = results[target.endpoint] ?? { outcome: 'sent' }
      if (result === 'throw') {
        throw new Error(`sender exploded for ${target.endpoint}`)
      }
      return result
    },
  }
  const notifier = new PushNotifier({
    repository: repository as unknown as ConstructorParameters<
      typeof PushNotifier
    >[0]['repository'],
    sender,
    now: () => 5_000,
    onError: (error) => errors.push(error),
    log: (event) => logs.push(event),
  })
  return { notifier, repository, payloads, errors, logs }
}

describe('PushNotifier', () => {
  it('sends to every registered device', async () => {
    const harness = build({})
    harness.repository.setSubscriptions([subscription('a'), subscription('b')])

    await harness.notifier.notify(USER, sessionFixture)

    assert.equal(harness.payloads.length, 2)
    assert.deepEqual(harness.repository.used, ['a', 'b'])
  })

  it('carries no terminal output in the payload', async () => {
    // The payload crosses a third-party push service. It may say a session
    // wants attention; it may not say what the session is doing.
    const harness = build({})
    harness.repository.setSubscriptions([subscription('a')])

    await harness.notifier.notify(USER, {
      ...sessionFixture,
      name: 'portal-ui',
      title: 'waiting on a permission prompt',
    })

    const payload: unknown = JSON.parse(harness.payloads[0] ?? '{}')
    assert.deepEqual(payload, {
      title: 'portal-ui needs you',
      body: 'waiting on a permission prompt',
      sessionId: sessionFixture.id,
    })
  })

  it('deletes an endpoint the push service says is gone', async () => {
    const harness = build({ b: { outcome: 'expired' } })
    harness.repository.setSubscriptions([subscription('a'), subscription('b')])

    await harness.notifier.notify(USER, sessionFixture)

    assert.deepEqual(harness.repository.deleted, ['b'], 'a dead endpoint is not retried forever')
    assert.deepEqual(harness.repository.used, ['a'])
  })

  it('one failing device does not stop the others', async () => {
    const harness = build({ a: { outcome: 'failed', error: new Error('502') } })
    harness.repository.setSubscriptions([subscription('a'), subscription('b')])

    await harness.notifier.notify(USER, sessionFixture)

    assert.equal(harness.repository.used.includes('b'), true)
    assert.equal(harness.errors.length, 1)
    assert.deepEqual(harness.repository.deleted, [], 'a transient failure keeps the row')
  })

  it('a sender that throws is an error, not a crash', async () => {
    const harness = build({ a: 'throw' })
    harness.repository.setSubscriptions([subscription('a'), subscription('b')])

    await harness.notifier.notify(USER, sessionFixture)

    assert.equal(harness.errors.length, 1)
    assert.deepEqual(harness.repository.used, ['b'])
  })

  it('logs the outcome and latency, and never the payload', async () => {
    const harness = build({ b: { outcome: 'expired' }, c: { outcome: 'failed', error: 1 } })
    harness.repository.setSubscriptions([
      subscription('a'),
      subscription('b'),
      subscription('c'),
    ])

    await harness.notifier.notify(USER, sessionFixture)

    const log = harness.logs[0]
    assert.deepEqual(log, {
      sessionId: sessionFixture.id,
      attempted: 3,
      sent: 1,
      expired: 1,
      failed: 1,
      durationMs: 0,
    })
    assert.equal(JSON.stringify(log).includes('needs you'), false)
  })

  it('does nothing at all when nobody is subscribed', async () => {
    const harness = build({})

    await harness.notifier.notify(USER, sessionFixture)
    await harness.notifier.notifyAll(sessionFixture)

    assert.deepEqual(harness.payloads, [])
    assert.deepEqual(harness.logs, [], 'no devices means no delivery to report')
  })

  it('falls back to a generic body when the session has no title', async () => {
    const harness = build({})
    harness.repository.setSubscriptions([subscription('a')])

    await harness.notifier.notify(USER, { ...sessionFixture, title: null })

    const payload = JSON.parse(harness.payloads[0] ?? '{}') as { body: string }
    assert.equal(payload.body, 'The session is waiting for an answer.')
  })
})

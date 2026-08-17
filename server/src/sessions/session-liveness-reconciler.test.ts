import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionFixture } from '@termspace/contracts'

import type { ActivityChange } from '../activity/activity-tracker.js'
import { SessionActivityTracker } from '../activity/activity-tracker.js'
import { SessionLivenessReconciler } from './session-liveness-reconciler.js'

const LIVE_SID = 'ses_scratch00003'

function setup(liveIds: readonly string[] = [sessionFixture.id]): {
  readonly changes: ActivityChange[]
  readonly reconciler: SessionLivenessReconciler
} {
  const changes: ActivityChange[] = []
  const activity = new SessionActivityTracker({ now: () => 1_000 })
  activity.listen((change) => changes.push(change))
  const reconciler = new SessionLivenessReconciler({
    activity,
    sessions: {
      list: () => [
        sessionFixture,
        { ...sessionFixture, id: LIVE_SID, state: 'idle' },
      ],
    },
    tmux: { listSessionIds: async () => new Set(liveIds) },
  })
  return { changes, reconciler }
}

describe('SessionLivenessReconciler', () => {
  it('marks only persisted sessions missing from tmux as dead', async () => {
    const { changes, reconciler } = setup([LIVE_SID])

    await reconciler.reconcile()

    assert.deepEqual(changes.map(({ sessionId, state }) => ({ sessionId, state })), [
      { sessionId: sessionFixture.id, state: 'dead' },
    ])
  })

  it('emits the dead transition once across repeated snapshots', async () => {
    const { changes, reconciler } = setup([LIVE_SID])

    await reconciler.reconcile()
    await reconciler.reconcile()

    assert.equal(changes.length, 1)
  })

  it('does not invoke tmux when there are no persisted sessions', async () => {
    let calls = 0
    const reconciler = new SessionLivenessReconciler({
      activity: new SessionActivityTracker(),
      sessions: { list: () => [] },
      tmux: {
        listSessionIds: async () => {
          calls += 1
          return new Set()
        },
      },
    })

    await reconciler.reconcile()

    assert.equal(calls, 0)
  })

  it('reports a snapshot failure without marking every session dead', async () => {
    const errors: unknown[] = []
    const changes: ActivityChange[] = []
    const scheduled: (() => void)[] = []
    const activity = new SessionActivityTracker()
    activity.listen((change) => changes.push(change))
    const reconciler = new SessionLivenessReconciler({
      activity,
      sessions: { list: () => [sessionFixture] },
      tmux: {
        listSessionIds: async () => {
          throw new Error('tmux unavailable')
        },
      },
      schedule: (handler) => {
        scheduled.push(handler)
        return () => {}
      },
      onError: (error) => errors.push(error),
    })

    reconciler.start()
    await new Promise<void>((resolve) => { setImmediate(resolve) })

    assert.equal(errors.length, 1)
    assert.deepEqual(changes, [])
    assert.equal(scheduled.length, 1, 'a transient failure is retried later')
    reconciler.dispose()
  })
})

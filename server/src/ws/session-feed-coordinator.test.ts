import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { SessionFeedCoordinator } from './session-feed-coordinator.js'

describe('SessionFeedCoordinator', () => {
  it('elects one buffer writer and promotes the next viewer on release', () => {
    const coordinator = new SessionFeedCoordinator()
    const first = coordinator.acquire('session-1')
    const second = coordinator.acquire('session-1')

    assert.equal(first.isWriter(), true)
    assert.equal(second.isWriter(), false)

    first.release()
    assert.equal(first.isWriter(), false)
    assert.equal(second.isWriter(), true)

    second.release()
    assert.equal(second.isWriter(), false)
  })

  it('tracks sessions independently', () => {
    const coordinator = new SessionFeedCoordinator()
    const first = coordinator.acquire('session-1')
    const other = coordinator.acquire('session-2')

    assert.equal(first.isWriter(), true)
    assert.equal(other.isWriter(), true)
  })
})

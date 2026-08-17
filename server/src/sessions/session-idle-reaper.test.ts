import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionFixture, type Session } from '@termspace/contracts'

import { SessionIdleReaper } from './session-idle-reaper.js'

function session(id: string, state: Session['state'], lastActivityAt: number): Session {
  return { ...sessionFixture, id, state, lastActivityAt }
}

describe('SessionIdleReaper', () => {
  it('deletes only idle sessions whose grace period has elapsed', async () => {
    const rows = [
      session('ses_expired00001', 'idle', 4_000),
      session('ses_boundary001', 'idle', 5_000),
      session('ses_recent000001', 'idle', 5_001),
      session('ses_working0001', 'working', 1_000),
      session('ses_needsyou001', 'needs-you', 1_000),
      session('ses_dead0000001', 'dead', 1_000),
    ]
    const deleted: string[] = []
    const reaper = new SessionIdleReaper({
      sessions: {
        list: () => rows,
        find: (id) => rows.find((row) => row.id === id) ?? null,
        delete: async (id) => {
          deleted.push(id)
          return true
        },
      },
      graceMs: 5_000,
      now: () => 10_000,
    })

    await reaper.reap()

    assert.deepEqual(deleted, ['ses_expired00001', 'ses_boundary001'])
  })

  it('rechecks a candidate before deletion and preserves newly active sessions', async () => {
    const old = session('ses_candidate001', 'idle', 1_000)
    const current = { ...old, state: 'working' as const, lastActivityAt: 9_500 }
    let deleted = false
    const reaper = new SessionIdleReaper({
      sessions: {
        list: () => [old],
        find: () => current,
        delete: async () => {
          deleted = true
          return true
        },
      },
      graceMs: 5_000,
      now: () => 10_000,
    })

    await reaper.reap()

    assert.equal(deleted, false)
  })

  it('reports one deletion failure and continues with later candidates', async () => {
    const rows = [
      session('ses_dirty0000001', 'idle', 1_000),
      session('ses_clean0000001', 'idle', 1_000),
    ]
    const deleted: string[] = []
    const errors: unknown[] = []
    const failure = new Error('dirty worktree')
    const reaper = new SessionIdleReaper({
      sessions: {
        list: () => rows,
        find: (id) => rows.find((row) => row.id === id) ?? null,
        delete: async (id) => {
          if (id === rows[0]?.id) {
            throw failure
          }
          deleted.push(id)
          return true
        },
      },
      graceMs: 5_000,
      now: () => 10_000,
      onError: (error) => errors.push(error),
    })

    await reaper.reap()

    assert.deepEqual(errors, [failure])
    assert.deepEqual(deleted, ['ses_clean0000001'])
  })

  it('runs immediately, schedules the next pass, and cancels on disposal', async () => {
    let listCalls = 0
    let scheduledDelay: number | undefined
    let cancelled = false
    const reaper = new SessionIdleReaper({
      sessions: {
        list: () => {
          listCalls += 1
          return []
        },
        find: () => null,
        delete: async () => false,
      },
      graceMs: 5_000,
      intervalMs: 1_234,
      schedule: (_handler, delayMs) => {
        scheduledDelay = delayMs
        return () => {
          cancelled = true
        }
      },
    })

    reaper.start()
    await new Promise<void>((resolve) => { setImmediate(resolve) })
    reaper.dispose()

    assert.equal(listCalls, 1)
    assert.equal(scheduledDelay, 1_234)
    assert.equal(cancelled, true)
  })
})

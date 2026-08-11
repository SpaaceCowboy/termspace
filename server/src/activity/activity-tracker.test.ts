import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import type { ActivityChange } from './activity-tracker.js'
import { SessionActivityTracker, WORKING_WINDOW_MS } from './activity-tracker.js'

const SID = 'ses_portalui0001'

/** Drives time by hand, so a 3 s rule costs no wall clock in the suite. */
class FakeClock {
  now = 1_000
  #pending: { at: number; handler: () => void }[] = []

  schedule = (handler: () => void, delayMs: number): (() => void) => {
    const entry = { at: this.now + delayMs, handler }
    this.#pending.push(entry)
    return () => {
      this.#pending = this.#pending.filter((candidate) => candidate !== entry)
    }
  }

  advance(ms: number): void {
    this.now += ms
    const due = this.#pending.filter((entry) => entry.at <= this.now)
    this.#pending = this.#pending.filter((entry) => entry.at > this.now)
    for (const entry of due) {
      entry.handler()
    }
  }
}

describe('SessionActivityTracker', () => {
  let clock: FakeClock
  let changes: ActivityChange[]
  let tracker: SessionActivityTracker

  beforeEach(() => {
    clock = new FakeClock()
    changes = []
    tracker = new SessionActivityTracker({
      now: () => clock.now,
      schedule: clock.schedule,
    })
    tracker.listen((change) => changes.push(change))
  })

  it('goes to working on output and settles to idle after the window', () => {
    tracker.register(SID, 'shell')
    tracker.observe(SID, 'building...\n')
    assert.deepEqual(
      changes.map((change) => change.state),
      ['working'],
    )

    clock.advance(WORKING_WINDOW_MS)
    assert.deepEqual(
      changes.map((change) => change.state),
      ['working', 'idle'],
    )
  })

  it('announces a change once, not on every chunk of output', () => {
    tracker.register(SID, 'shell')
    for (let index = 0; index < 20; index += 1) {
      clock.advance(10)
      tracker.observe(SID, `line ${String(index)}\n`)
    }
    // Twenty writes, one transition: the frame is edge-triggered, not a poll.
    assert.deepEqual(
      changes.map((change) => change.state),
      ['working'],
    )
  })

  it('keeps resetting the window while output continues', () => {
    tracker.register(SID, 'shell')
    tracker.observe(SID, 'a')
    for (let index = 0; index < 5; index += 1) {
      clock.advance(WORKING_WINDOW_MS - 500)
      tracker.observe(SID, 'b')
    }
    assert.deepEqual(
      changes.map((change) => change.state),
      ['working'],
      'it never fell out of working while output kept arriving',
    )

    clock.advance(WORKING_WINDOW_MS)
    assert.equal(changes.at(-1)?.state, 'idle')
  })

  it('reaches needs-you when an agent is asking a question', () => {
    tracker.register(SID, 'claude')
    tracker.observe(SID, 'Do you want to proceed?\n❯ 1. Yes, I trust this folder\n  2. No, exit\n')
    clock.advance(WORKING_WINDOW_MS)

    assert.equal(changes.at(-1)?.state, 'needs-you')
  })

  it('leaves needs-you as soon as output resumes', () => {
    tracker.register(SID, 'claude')
    tracker.observe(SID, '❯ 1. Yes, proceed\n')
    clock.advance(WORKING_WINDOW_MS)
    assert.equal(tracker.state(SID), 'needs-you')

    tracker.observe(SID, 'running the thing\n')
    assert.equal(tracker.state(SID), 'working')
  })

  it('never puts a plain shell into needs-you', () => {
    // A shell at its prompt is resting, not asking. Treating it as needs-you
    // would buzz a phone for every idle terminal and make the signal useless.
    tracker.register(SID, 'shell')
    tracker.observe(SID, 'spacecowboy@Bebop:~/projects/test$ ')
    clock.advance(WORKING_WINDOW_MS)

    assert.equal(changes.at(-1)?.state, 'idle')
  })

  it('sees the prompt through ANSI colour and trailing blank lines', () => {
    tracker.register(SID, 'claude')
    tracker.observe(SID, '[32m❯ 1. Yes[0m\n\n   \n\n')
    clock.advance(WORKING_WINDOW_MS)

    assert.equal(changes.at(-1)?.state, 'needs-you')
  })

  it('reports when the state was entered, so a client can age it', () => {
    tracker.register(SID, 'shell')
    clock.advance(500)
    tracker.observe(SID, 'go')

    assert.equal(changes.at(-1)?.since, clock.now)
  })

  it('dead outranks whatever the last line said, and stays dead', () => {
    tracker.register(SID, 'claude')
    tracker.observe(SID, '❯ 1. Yes\n')
    tracker.markDead(SID)
    assert.equal(changes.at(-1)?.state, 'dead')

    clock.advance(WORKING_WINDOW_MS * 2)
    assert.equal(tracker.state(SID), 'dead', 'a pending timer cannot revive it')
  })

  it('ignores a session it was never told about', () => {
    tracker.observe('ses_unknown00001', 'output')
    assert.deepEqual(changes, [])
  })

  it('forgetting a session cancels its pending timer', () => {
    tracker.register(SID, 'shell')
    tracker.observe(SID, 'go')
    tracker.forget(SID)
    changes = []

    clock.advance(WORKING_WINDOW_MS * 2)
    assert.deepEqual(changes, [])
  })

  it('a throwing listener does not stop the others', () => {
    const seen: string[] = []
    const quiet = new SessionActivityTracker({
      now: () => clock.now,
      schedule: clock.schedule,
      onError: () => {
        seen.push('error')
      },
    })
    quiet.listen(() => {
      throw new Error('listener blew up')
    })
    quiet.listen((change) => seen.push(change.state))
    quiet.register(SID, 'shell')
    quiet.observe(SID, 'go')

    assert.deepEqual(seen, ['error', 'working'])
  })
})

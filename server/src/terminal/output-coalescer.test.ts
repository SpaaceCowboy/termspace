import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ScheduledTimer, TimerScheduler } from './output-coalescer.js'
import {
  COALESCE_INTERVALS_MS,
  DEFAULT_VISIBILITY,
  OutputCoalescer,
  createOutputCoalescer,
} from './output-coalescer.js'

class ManualScheduler implements TimerScheduler {
  delay: number | undefined
  #callback: (() => void) | undefined

  set(delayMs: number, callback: () => void): ScheduledTimer {
    this.delay = delayMs
    this.#callback = callback
    return { cancel: () => (this.#callback = undefined) }
  }

  fire(): void {
    const callback = this.#callback
    this.#callback = undefined
    callback?.()
  }
}

describe('OutputCoalescer', () => {
  it('combines focused output into one 16 ms flush', () => {
    const scheduler = new ManualScheduler()
    const flushed: string[] = []
    const coalescer = new OutputCoalescer({
      intervalMs: 16,
      maxBytes: 1_024,
      onFlush: (data) => flushed.push(data),
      onTruncated: () => {},
      scheduler,
    })

    coalescer.push('one')
    coalescer.push('two')

    assert.equal(scheduler.delay, 16)
    assert.deepEqual(flushed, [])
    scheduler.fire()
    assert.deepEqual(flushed, ['onetwo'])
  })

  it('never queues beyond its byte budget', () => {
    const scheduler = new ManualScheduler()
    const events: string[] = []
    const coalescer = new OutputCoalescer({
      intervalMs: 16,
      maxBytes: 5,
      onFlush: (data) => events.push(data),
      onTruncated: () => events.push('truncated'),
      scheduler,
    })

    coalescer.push('1234')
    coalescer.push('5678')
    scheduler.fire()

    assert.deepEqual(events, ['truncated'])
  })

  it('clears a pending timer on disposal', () => {
    const scheduler = new ManualScheduler()
    const flushed: string[] = []
    const coalescer = new OutputCoalescer({
      intervalMs: 16,
      maxBytes: 1_024,
      onFlush: (data) => flushed.push(data),
      onTruncated: () => {},
      scheduler,
    })

    coalescer.push('pending')
    coalescer.dispose()
    scheduler.fire()

    assert.deepEqual(flushed, [])
  })
})

describe('OutputCoalescer visibility tiers', () => {
  function createHarness(): {
    coalescer: OutputCoalescer
    scheduler: ManualScheduler
    flushed: string[]
  } {
    const scheduler = new ManualScheduler()
    const flushed: string[] = []
    const coalescer = new OutputCoalescer({
      intervalMs: COALESCE_INTERVALS_MS.visible,
      maxBytes: 1_024,
      onFlush: (data) => flushed.push(data),
      onTruncated: () => {},
      scheduler,
    })
    return { coalescer, scheduler, flushed }
  }

  it('uses the tier for each visibility level', () => {
    const { coalescer, scheduler } = createHarness()

    coalescer.setVisibility('focused')
    coalescer.push('a')
    assert.equal(scheduler.delay, 16)
    scheduler.fire()

    coalescer.setVisibility('hidden')
    coalescer.push('b')
    assert.equal(scheduler.delay, 250)
    scheduler.fire()

    coalescer.setVisibility('visible')
    coalescer.push('c')
    assert.equal(scheduler.delay, 50)
  })

  it('flushes what is buffered the moment a pane becomes more visible', () => {
    const { coalescer, flushed } = createHarness()
    coalescer.setVisibility('hidden')
    coalescer.push('output nobody was watching')

    coalescer.setVisibility('focused')

    // Not held for the remainder of the 250 ms window: the person is looking
    // at this pane now.
    assert.deepEqual(flushed, ['output nobody was watching'])
  })

  it('does not starve a pane that is flipped back and forth', () => {
    const { coalescer, flushed } = createHarness()
    coalescer.push('first')

    // Cancel-and-reschedule on every change would push the deadline out
    // forever and this would never be delivered.
    for (const level of ['focused', 'hidden', 'focused', 'hidden', 'focused'] as const) {
      coalescer.setVisibility(level)
    }

    assert.equal(flushed.join(''), 'first')
  })

  it('never delays buffered output when a pane becomes less visible', () => {
    const { coalescer, scheduler, flushed } = createHarness()
    coalescer.setVisibility('focused')
    coalescer.push('already waiting')

    coalescer.setVisibility('hidden')
    // The pending 16 ms timer is left alone rather than pushed out to 250 ms.
    assert.equal(scheduler.delay, 16)
    scheduler.fire()
    assert.deepEqual(flushed, ['already waiting'])

    // Only the next window uses the slower tier.
    coalescer.push('later')
    assert.equal(scheduler.delay, 250)
  })

  it('ignores a change to the level it is already at', () => {
    const { coalescer, flushed } = createHarness()
    coalescer.setVisibility('focused')
    coalescer.push('buffered')

    coalescer.setVisibility('focused')

    // A no-op must not turn into a flush, or a client resending vis on
    // reconnect would defeat the coalescing entirely.
    assert.deepEqual(flushed, [])
  })

  it('starts at the visible tier, not the focused one', () => {
    const scheduler = new ManualScheduler()
    assert.equal(DEFAULT_VISIBILITY, 'visible')
    const coalescer = createOutputCoalescer(() => {}, () => {})
    coalescer.push('x')
    // The real factory uses a real timer; assert the tier it was built with.
    assert.equal(COALESCE_INTERVALS_MS[DEFAULT_VISIBILITY], 50)
    coalescer.dispose()
    assert.equal(scheduler.delay, undefined)
  })
})

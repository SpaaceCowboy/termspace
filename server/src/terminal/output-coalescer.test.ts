import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ScheduledTimer, TimerScheduler } from './output-coalescer.js'
import { OutputCoalescer } from './output-coalescer.js'

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

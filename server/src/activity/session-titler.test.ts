import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import type { ActivityChange } from './activity-tracker.js'
import type { TitleChange } from './session-titler.js'
import { SessionTitler, TITLE_SAMPLE_DELAY_MS } from './session-titler.js'

const SID = 'ses_portalui0001'

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

function change(state: ActivityChange['state']): ActivityChange {
  return { sessionId: SID, state, since: 1_000, agent: 'claude' }
}

/** Lets a test hold a read open, which is how the race cases are driven. */
function deferred(): {
  promise: Promise<string>
  resolve: (value: string) => void
} {
  let resolve!: (value: string) => void
  const promise = new Promise<string>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

describe('SessionTitler', () => {
  let clock: FakeClock
  let titles: TitleChange[]
  let paneTitle: string
  let reads: number
  let titler: SessionTitler

  beforeEach(() => {
    clock = new FakeClock()
    titles = []
    paneTitle = '✳ Claude Code'
    reads = 0
    titler = new SessionTitler({
      readTitle: async () => {
        reads += 1
        return paneTitle
      },
      hostname: 'Bebop',
      schedule: clock.schedule,
    })
    titler.listen((title) => titles.push(title))
    titler.register(SID, null)
  })

  it('does not read the title the instant a session starts working', () => {
    titler.observe(change('working'))
    // The agent has not published the new task yet; reading now returns the
    // previous one.
    assert.equal(reads, 0)
  })

  it('reads it shortly into the turn, while the session is still working', async () => {
    paneTitle = '◑ Count markdown files in docs'
    titler.observe(change('working'))
    clock.advance(TITLE_SAMPLE_DELAY_MS)
    await Promise.resolve()

    assert.deepEqual(titles, [{ sessionId: SID, title: 'Count markdown files in docs' }])
  })

  it('reads it again when the session settles', async () => {
    paneTitle = '◑ Count markdown files in docs'
    titler.observe(change('working'))
    clock.advance(TITLE_SAMPLE_DELAY_MS)
    await Promise.resolve()

    paneTitle = '✳ Counted the markdown files'
    titler.observe(change('idle'))
    await Promise.resolve()

    assert.deepEqual(titles.map((entry) => entry.title), [
      'Count markdown files in docs',
      'Counted the markdown files',
    ])
  })

  it('announces a title once, not on every edge that reads the same one', async () => {
    paneTitle = '◑ Count markdown files in docs'
    titler.observe(change('working'))
    clock.advance(TITLE_SAMPLE_DELAY_MS)
    await Promise.resolve()
    // Same task, settled: only the liveness glyph differs.
    paneTitle = '✳ Count markdown files in docs'
    titler.observe(change('idle'))
    await Promise.resolve()

    assert.equal(titles.length, 1)
  })

  it('keeps the last real title when the pane has nothing to say', async () => {
    paneTitle = '◑ Count markdown files in docs'
    titler.observe(change('working'))
    clock.advance(TITLE_SAMPLE_DELAY_MS)
    await Promise.resolve()

    paneTitle = '✳ Claude Code'
    titler.observe(change('idle'))
    await Promise.resolve()

    assert.equal(titler.title(SID), 'Count markdown files in docs')
    assert.equal(titles.length, 1)
  })

  it('cancels the pending read when the session settles first', async () => {
    titler.observe(change('working'))
    titler.observe(change('idle'))
    await Promise.resolve()
    const afterSettle = reads
    clock.advance(TITLE_SAMPLE_DELAY_MS * 2)

    // The settle read happened; the scheduled working read did not fire again.
    assert.equal(reads, afterSettle)
  })

  it('never reads a dead session', async () => {
    titler.observe(change('working'))
    titler.observe(change('dead'))
    clock.advance(TITLE_SAMPLE_DELAY_MS * 2)
    await Promise.resolve()

    assert.equal(reads, 0)
    assert.deepEqual(titles, [])
  })

  it('does not let a slow read overwrite a newer title', async () => {
    const slow = deferred()
    const fast = deferred()
    const pending = [slow.promise, fast.promise]
    const racing = new SessionTitler({
      readTitle: async () => pending.shift() ?? '',
      hostname: 'Bebop',
      schedule: clock.schedule,
    })
    const seen: TitleChange[] = []
    racing.listen((title) => seen.push(title))
    racing.register(SID, null)

    racing.observe(change('idle'))
    racing.observe(change('idle'))
    // The second read finishes first, then the first read lands late.
    fast.resolve('✳ the newer title')
    await Promise.resolve()
    slow.resolve('✳ the older title')
    await new Promise((settle) => setImmediate(settle))

    assert.deepEqual(seen.map((entry) => entry.title), ['the newer title'])
    assert.equal(racing.title(SID), 'the newer title')
  })

  it('does not re-announce the title a session already had', async () => {
    const restarted = new SessionTitler({
      readTitle: async () => '✳ Count markdown files in docs',
      hostname: 'Bebop',
      schedule: clock.schedule,
    })
    const seen: TitleChange[] = []
    restarted.listen((title) => seen.push(title))
    // What the database already holds for this session.
    restarted.register(SID, 'Count markdown files in docs')

    restarted.observe(change('idle'))
    await Promise.resolve()

    assert.deepEqual(seen, [])
  })

  it('survives a read that throws, and keeps working afterwards', async () => {
    const errors: unknown[] = []
    let fail = true
    const flaky = new SessionTitler({
      readTitle: async () => {
        if (fail) {
          throw new Error('no server running')
        }
        return '✳ a real title'
      },
      hostname: 'Bebop',
      schedule: clock.schedule,
      onError: (error) => errors.push(error),
    })
    const seen: TitleChange[] = []
    flaky.listen((title) => seen.push(title))
    flaky.register(SID, null)

    flaky.observe(change('idle'))
    await new Promise((settle) => setImmediate(settle))
    assert.equal(errors.length, 1)
    assert.equal(seen.length, 0)

    fail = false
    flaky.observe(change('idle'))
    await new Promise((settle) => setImmediate(settle))
    assert.deepEqual(seen.map((entry) => entry.title), ['a real title'])
  })

  it('ignores a session it was never told about', async () => {
    titler.observe({ ...change('idle'), sessionId: 'ses_unknown00001' })
    await Promise.resolve()

    assert.equal(reads, 0)
  })

  it('drops a forgotten session rather than announcing a late read', async () => {
    const slow = deferred()
    const racing = new SessionTitler({
      readTitle: async () => slow.promise,
      hostname: 'Bebop',
      schedule: clock.schedule,
    })
    const seen: TitleChange[] = []
    racing.listen((title) => seen.push(title))
    racing.register(SID, null)

    racing.observe(change('idle'))
    racing.forget(SID)
    slow.resolve('✳ a title nobody is waiting for')
    await new Promise((settle) => setImmediate(settle))

    assert.deepEqual(seen, [])
  })
})

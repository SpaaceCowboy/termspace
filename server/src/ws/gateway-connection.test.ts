import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ServerFrame, Session, VisibilityLevel } from '@termspace/contracts'

import type {
  GatewayAttachment,
  GatewayCoalescer,
  GatewayConnectionDependencies,
} from './gateway-connection.js'
import { SessionActivityTracker } from '../activity/activity-tracker.js'
import { SessionTitler } from '../activity/session-titler.js'
import { GatewayConnection } from './gateway-connection.js'
import { SessionFeedCoordinator } from './session-feed-coordinator.js'

const SID = 'ses_portalui0001'
const SESSION: Session = {
  id: SID,
  projectId: 'project-1',
  name: 'Portal',
  agent: 'claude',
  cwd: '/srv/project',
  worktreeBranch: null,
  hasCwdConflict: false,
  state: 'idle',
  title: null,
  lastActivityAt: 100,
  createdAt: 100,
}

class FakeAttachment implements GatewayAttachment {
  readonly resizes: { cols: number; rows: number }[] = []
  readonly writes: string[] = []
  closed = false

  close(): void {
    this.closed = true
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows })
  }

  write(data: string): void {
    this.writes.push(data)
  }
}

class FakeCoalescer implements GatewayCoalescer {
  disposed = false
  readonly levels: VisibilityLevel[] = []
  readonly #onFlush: (data: string) => void

  constructor(onFlush: (data: string) => void) {
    this.#onFlush = onFlush
  }

  dispose(): void {
    this.disposed = true
  }

  setVisibility(level: VisibilityLevel): void {
    this.levels.push(level)
  }

  push(data: string): void {
    this.#onFlush(data)
  }
}

function createHarness(
  session: Session | null = SESSION,
  paneTitle = '',
): {
  attachment: FakeAttachment
  callbacks: {
    onData: (data: string) => void
    onExit: (event: { exitCode: number }) => void
  }[]
  connection: GatewayConnection
  frames: ServerFrame[]
  binaries: Buffer[]
  bufferWrites: string[]
  errors: unknown[]
  activity: SessionActivityTracker
  titles: SessionTitler
  coalescers: FakeCoalescer[]
} {
  const attachment = new FakeAttachment()
  const callbacks: {
    onData: (data: string) => void
    onExit: (event: { exitCode: number }) => void
  }[] = []
  const frames: ServerFrame[] = []
  const binaries: Buffer[] = []
  const bufferWrites: string[] = []
  const errors: unknown[] = []
  const coalescers: FakeCoalescer[] = []
  const activity = new SessionActivityTracker({
    now: () => 1_000,
    // Never fires on its own: these tests drive transitions explicitly, and a
    // real 3 s timer would make the suite wait for wall-clock time.
    schedule: () => () => undefined,
  })
  const titles = new SessionTitler({
    // These tests drive titles explicitly; a real tmux read has no place here.
    readTitle: async () => paneTitle,
    hostname: 'test-host',
    schedule: () => () => undefined,
  })
  const dependencies: GatewayConnectionDependencies = {
    activity,
    titles,
    sessions: { find: () => session },
    attachments: {
      attach: (_sessionId, viewerCallbacks) => {
        callbacks.push(viewerCallbacks)
        return attachment
      },
    },
    buffers: {
      restore: async () => 'restored-screen',
      write: async (_sessionId, data) => {
        bufferWrites.push(data)
      },
    },
    capture: async () => 'captured-screen',
    feeds: new SessionFeedCoordinator(),
    createCoalescer: (onFlush) => {
      const coalescer = new FakeCoalescer(onFlush)
      coalescers.push(coalescer)
      return coalescer
    },
    transport: {
      sendBinary: (data) => binaries.push(data),
      sendFrame: (frame) => frames.push(frame),
    },
    onError: (error) => errors.push(error),
  }
  return {
    attachment,
    callbacks,
    connection: new GatewayConnection(dependencies),
    frames,
    binaries,
    bufferWrites,
    errors,
    activity,
    titles,
    coalescers,
  }
}

describe('GatewayConnection', () => {
  it('restores, attaches, buffers, and sends binary output for a subscription', async () => {
    const harness = createHarness()

    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)
    harness.callbacks[0]?.onData('ready')
    await Promise.resolve()

    assert.deepEqual(harness.frames, [
      { t: 'restore', sid: SID, data: 'restored-screen' },
      // A subscriber is told the state it is joining. Status frames are
      // edge-triggered, so without this the pane would show nothing until the
      // next transition, which could be minutes away.
      { t: 'status', sid: SID, state: 'idle', since: 1_000 },
      { t: 'status', sid: SID, state: 'working', since: 1_000 },
    ])
    assert.deepEqual(harness.bufferWrites, ['ready'])
    assert.equal(harness.binaries[0]?.subarray(0, 16).toString('ascii'), SID)
    assert.equal(harness.binaries[0]?.subarray(16).toString('utf8'), 'ready')
  })

  it('stops forwarding status once the connection is closed', async () => {
    const harness = createHarness()
    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)
    harness.connection.close()
    const before = harness.frames.length

    harness.activity.observe(SID, 'more output')

    assert.equal(harness.frames.length, before, 'a closed connection is deaf')
  })

  it('routes input, resize, ping, unsubscribe, and close to owned resources', async () => {
    const harness = createHarness()
    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)

    await harness.connection.handleText(
      `{"t":"in","sid":"${SID}","data":"ls\\r"}`,
    )
    await harness.connection.handleText(
      `{"t":"resize","sid":"${SID}","cols":120,"rows":40}`,
    )
    await harness.connection.handleText('{"t":"ping"}')
    await harness.connection.handleText(`{"t":"unsub","sid":"${SID}"}`)
    harness.connection.close()

    assert.deepEqual(harness.attachment.writes, ['ls\r'])
    assert.deepEqual(harness.attachment.resizes, [{ cols: 120, rows: 40 }])
    assert.equal(harness.attachment.closed, true)
    assert.deepEqual(harness.frames.at(-1), { t: 'pong' })
  })

  it('reports invalid frames and unknown sessions without attaching', async () => {
    const invalid = createHarness()
    await invalid.connection.handleText('{')
    assert.deepEqual(invalid.frames, [
      {
        t: 'error',
        sid: null,
        code: 'validation_failed',
        message: 'Invalid WebSocket frame.',
      },
    ])

    const missing = createHarness(null)
    await missing.connection.handleText(`{"t":"sub","sid":"${SID}"}`)
    assert.equal(missing.callbacks.length, 0)
    assert.equal(missing.frames[0]?.t, 'error')
  })

  it('sends exit and releases a subscription when its viewer exits', async () => {
    const harness = createHarness()
    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)

    harness.callbacks[0]?.onExit({ exitCode: 0 })

    assert.deepEqual(harness.frames.at(-1), { t: 'exit', sid: SID, code: 0 })
    assert.equal(harness.attachment.closed, true)
  })

  it('sends a title frame only to a connection subscribed to that session', async () => {
    const harness = createHarness(SESSION, '\u2733 Count markdown files in docs')

    // Nothing subscribed yet: the change must not be forwarded.
    harness.titles.register(SID, null)
    harness.titles.observe({ sessionId: SID, state: 'idle', since: 1_000, agent: 'claude' })
    await new Promise((settle) => setImmediate(settle))
    assert.equal(harness.frames.some((frame) => frame.t === 'title'), false)

    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)
    harness.titles.observe({ sessionId: SID, state: 'idle', since: 1_000, agent: 'claude' })
    await new Promise((settle) => setImmediate(settle))

    assert.deepEqual(
      harness.frames.filter((frame) => frame.t === 'title'),
      [{ t: 'title', sid: SID, title: 'Count markdown files in docs' }],
    )
  })

  it('tells a newly subscribed client the title the session already has', async () => {
    const harness = createHarness()
    harness.titles.register(SID, 'a title from a previous turn')

    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)

    assert.deepEqual(
      harness.frames.filter((frame) => frame.t === 'title'),
      [{ t: 'title', sid: SID, title: 'a title from a previous turn' }],
    )
  })

  it('stops forwarding titles once the connection is closed', async () => {
    const harness = createHarness(SESSION, '\u2733 a new title')
    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)
    harness.titles.register(SID, null)

    harness.connection.close()
    harness.titles.observe({ sessionId: SID, state: 'idle', since: 1_000, agent: 'claude' })
    await new Promise((settle) => setImmediate(settle))

    assert.equal(harness.frames.some((frame) => frame.t === 'title'), false)
  })

  it('applies a vis frame to that session\'s coalescer', async () => {
    const harness = createHarness()
    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)

    await harness.connection.handleText(`{"t":"vis","sid":"${SID}","level":"focused"}`)
    await harness.connection.handleText(`{"t":"vis","sid":"${SID}","level":"hidden"}`)

    assert.deepEqual(harness.coalescers[0]?.levels, ['focused', 'hidden'])
  })

  it('ignores a vis frame for a session it is not subscribed to', async () => {
    const harness = createHarness()
    await harness.connection.handleText(`{"t":"sub","sid":"${SID}"}`)

    await harness.connection.handleText(
      `{"t":"vis","sid":"ses_somethingelse","level":"focused"}`,
    )

    assert.deepEqual(harness.coalescers[0]?.levels, [])
  })
})

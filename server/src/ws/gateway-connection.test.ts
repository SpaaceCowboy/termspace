import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ServerFrame, Session } from '@termspace/contracts'

import type {
  GatewayAttachment,
  GatewayCoalescer,
  GatewayConnectionDependencies,
} from './gateway-connection.js'
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
  readonly #onFlush: (data: string) => void

  constructor(onFlush: (data: string) => void) {
    this.#onFlush = onFlush
  }

  dispose(): void {
    this.disposed = true
  }

  push(data: string): void {
    this.#onFlush(data)
  }
}

function createHarness(session: Session | null = SESSION): {
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
  const dependencies: GatewayConnectionDependencies = {
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
    createCoalescer: (onFlush) => new FakeCoalescer(onFlush),
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
    ])
    assert.deepEqual(harness.bufferWrites, ['ready'])
    assert.equal(harness.binaries[0]?.subarray(0, 16).toString('ascii'), SID)
    assert.equal(harness.binaries[0]?.subarray(16).toString('utf8'), 'ready')
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
})

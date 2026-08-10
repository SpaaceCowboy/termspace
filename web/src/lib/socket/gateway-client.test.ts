import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionFixture, sessionFixtures } from '@termspace/contracts'

import { BACKOFF } from './backoff.ts'
import { GatewayClient, type ConnectionState, type SocketLike } from './gateway-client.ts'

const SID = sessionFixture.id
const OTHER_SID = sessionFixtures[1]?.id ?? SID

class FakeSocket implements SocketLike {
  binaryType = ''
  readonly sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null

  send(data: string): void {
    if (this.closed) {
      throw new Error('socket is closed')
    }
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
  }

  get frames(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>)
  }
}

interface Harness {
  client: GatewayClient
  sockets: FakeSocket[]
  states: ConnectionState[]
  frames: unknown[]
  outputs: Array<{ sid: string; text: string }>
  runTimers: () => void
  pendingTimers: () => number
  ticketCalls: () => number
}

function harness(
  ticket: () => Promise<{ ok: true; ticket: string } | { ok: false; fatal: boolean }> = async () => ({
    ok: true,
    ticket: 'ticket-value',
  }),
): Harness {
  const sockets: FakeSocket[] = []
  const states: ConnectionState[] = []
  const frames: unknown[] = []
  const outputs: Array<{ sid: string; text: string }> = []
  let timers: Array<() => void> = []
  let ticketCalls = 0

  const client = new GatewayClient({
    requestTicket: async () => {
      ticketCalls += 1
      return ticket()
    },
    socketUrl: '/ws',
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    onState: (state) => states.push(state),
    onFrame: (frame) => frames.push(frame),
    onOutput: (sid, bytes) => outputs.push({ sid, text: new TextDecoder().decode(bytes) }),
    setTimer: (handler) => {
      timers.push(handler)
      return timers.length
    },
    clearTimer: () => {
      timers = []
    },
    random: () => 0.5,
  })

  return {
    client,
    sockets,
    states,
    frames,
    outputs,
    runTimers: () => {
      const pending = timers
      timers = []
      for (const handler of pending) {
        handler()
      }
    },
    pendingTimers: () => timers.length,
    ticketCalls: () => ticketCalls,
  }
}

const flush = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test('a subscription made before the socket opens is replayed on open', async () => {
  const h = harness()
  h.client.subscribe(SID, 'focused')
  h.client.connect()
  await flush()

  const socket = h.sockets[0]
  assert.ok(socket)
  assert.deepEqual(socket.sent, [])

  socket.onopen?.()
  assert.deepEqual(socket.frames, [
    { t: 'sub', sid: SID },
    { t: 'vis', sid: SID, level: 'focused' },
  ])
})

test('every pane is resubscribed on a reopened socket, not just the first', async () => {
  const h = harness()
  h.client.connect()
  await flush()
  h.sockets[0]?.onopen?.()
  h.client.subscribe(SID, 'focused')
  h.client.subscribe(OTHER_SID, 'hidden')

  h.sockets[0]?.onclose?.()
  h.runTimers()
  await flush()

  const reopened = h.sockets[1]
  assert.ok(reopened, 'expected a second socket')
  reopened.onopen?.()
  assert.deepEqual(reopened.frames, [
    { t: 'sub', sid: SID },
    { t: 'vis', sid: SID, level: 'focused' },
    { t: 'sub', sid: OTHER_SID },
    { t: 'vis', sid: OTHER_SID, level: 'hidden' },
  ])
})

test('a fresh ticket is fetched for every reconnect', async () => {
  const h = harness()
  h.client.connect()
  await flush()
  assert.equal(h.ticketCalls(), 1)

  h.sockets[0]?.onopen?.()
  h.sockets[0]?.onclose?.()
  h.runTimers()
  await flush()
  assert.equal(h.ticketCalls(), 2)
})

test('state moves connecting to connected to reconnecting and back', async () => {
  const h = harness()
  h.client.connect()
  await flush()
  h.sockets[0]?.onopen?.()
  h.sockets[0]?.onclose?.()
  h.runTimers()
  await flush()
  h.sockets[1]?.onopen?.()

  assert.deepEqual(h.states, ['connected', 'reconnecting', 'connected'])
  assert.equal(h.client.state, 'connected')
})

test('a fatal ticket failure goes straight to dead without retrying', async () => {
  const h = harness(async () => ({ ok: false, fatal: true }))
  h.client.connect()
  await flush()

  assert.equal(h.client.state, 'dead')
  assert.equal(h.pendingTimers(), 0)
  assert.equal(h.sockets.length, 0)
})

test('a non-fatal ticket failure retries instead of dying', async () => {
  const h = harness(async () => ({ ok: false, fatal: false }))
  h.client.connect()
  await flush()

  assert.equal(h.client.state, 'reconnecting')
  assert.equal(h.pendingTimers(), 1)
})

test('the client gives up and reports dead after the attempt ceiling', async () => {
  const h = harness()
  h.client.connect()
  await flush()

  for (let round = 0; round < BACKOFF.maxAttempts; round += 1) {
    assert.equal(h.client.state, round === 0 ? 'connecting' : 'reconnecting')
    h.sockets.at(-1)?.onclose?.()
    h.runTimers()
    await flush()
  }

  h.sockets.at(-1)?.onclose?.()
  assert.equal(h.client.state, 'dead')
  assert.equal(h.pendingTimers(), 0, 'a dead client must not hold a pending retry')
  assert.equal(h.sockets.length, BACKOFF.maxAttempts + 1)
})

test('a successful reopen resets the attempt counter', async () => {
  const h = harness()
  h.client.connect()
  await flush()

  for (let round = 0; round < 5; round += 1) {
    h.sockets.at(-1)?.onclose?.()
    h.runTimers()
    await flush()
  }
  h.sockets.at(-1)?.onopen?.()
  assert.equal(h.client.state, 'connected')

  h.sockets.at(-1)?.onclose?.()
  h.runTimers()
  await flush()
  for (let round = 0; round < BACKOFF.maxAttempts - 1; round += 1) {
    assert.notEqual(h.client.state, 'dead')
    h.sockets.at(-1)?.onclose?.()
    h.runTimers()
    await flush()
  }
})

test('dispose closes the socket, clears listeners, and stops reconnecting', async () => {
  const h = harness()
  h.client.subscribe(SID)
  h.client.connect()
  await flush()
  const socket = h.sockets[0]
  socket?.onopen?.()

  h.client.dispose()

  assert.equal(socket?.closed, true)
  assert.equal(socket?.onmessage, null)
  assert.equal(socket?.onclose, null)
  assert.equal(h.client.subscribedIds.length, 0)

  h.runTimers()
  await flush()
  assert.equal(h.sockets.length, 1, 'no socket should be opened after dispose')
})

test('binary messages route to output and text messages route to frames', async () => {
  const h = harness()
  h.client.connect()
  await flush()
  const socket = h.sockets[0]
  socket?.onopen?.()

  const payload = new Uint8Array(16 + 5)
  payload.set(new TextEncoder().encode(SID))
  payload.set(new TextEncoder().encode('hello'), 16)
  socket?.onmessage?.({ data: payload.buffer })
  socket?.onmessage?.({ data: JSON.stringify({ t: 'pong' }) })
  socket?.onmessage?.({ data: '{"t":"garbage"}' })

  assert.deepEqual(h.outputs, [{ sid: SID, text: 'hello' }])
  assert.deepEqual(h.frames, [{ t: 'pong' }])
})

test('frames sent while disconnected are dropped rather than thrown', async () => {
  const h = harness()
  h.client.connect()
  await flush()

  h.client.sendInput(SID, 'ls\r')
  h.client.sendResize(SID, 80, 24)
  assert.deepEqual(h.sockets[0]?.sent, [])
})

test('resize is clamped and oversized input is split before it reaches the wire', async () => {
  const h = harness()
  h.client.connect()
  await flush()
  const socket = h.sockets[0]
  socket?.onopen?.()

  h.client.sendResize(SID, 9_999, 0)
  h.client.sendInput(SID, 'x'.repeat(65_536 + 1))

  const frames = socket?.frames ?? []
  assert.deepEqual(frames[0], { t: 'resize', sid: SID, cols: 500, rows: 1 })
  assert.equal(frames[1]?.['t'], 'in')
  assert.equal(frames[2]?.['t'], 'in')
  assert.equal(String(frames[1]?.['data']).length, 65_536)
  assert.equal(String(frames[2]?.['data']).length, 1)
})

test('a repeated visibility level does not put another frame on the wire', async () => {
  const h = harness()
  h.client.connect()
  await flush()
  const socket = h.sockets[0]
  socket?.onopen?.()
  h.client.subscribe(SID, 'visible')
  const before = socket?.sent.length ?? 0

  h.client.sendVisibility(SID, 'visible')
  assert.equal(socket?.sent.length, before)

  h.client.sendVisibility(SID, 'focused')
  assert.deepEqual(socket?.frames.at(-1), { t: 'vis', sid: SID, level: 'focused' })
})

test('a throwing ticket fetch retries instead of wedging the client', async () => {
  let calls = 0
  const h = harness(async () => {
    calls += 1
    if (calls === 1) {
      throw new Error('network down')
    }
    return { ok: true, ticket: 'ticket-value' }
  })

  h.client.connect()
  await flush()
  assert.equal(h.client.state, 'reconnecting')
  assert.equal(h.pendingTimers(), 1, 'a thrown ticket fetch must still schedule a retry')

  h.runTimers()
  await flush()
  h.sockets.at(-1)?.onopen?.()
  assert.equal(h.client.state, 'connected')
})

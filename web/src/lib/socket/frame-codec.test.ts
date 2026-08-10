import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BINARY_SID_BYTES,
  binaryOutputFixture,
  clientFrameFixtures,
  serverFrameFixtures,
  sessionFixture,
} from '@termspace/contracts'

import {
  FRAME_LIMITS,
  chunkInput,
  clampResize,
  decodeServerFrame,
  decodeTerminalOutput,
  encodeClientFrame,
} from './frame-codec.ts'

const SERVER_FRAME_KINDS = [
  'restore',
  'status',
  'title',
  'exit',
  'truncated',
  'error',
  'pong',
] as const

const CLIENT_FRAME_KINDS = ['sub', 'unsub', 'in', 'resize', 'vis', 'ping'] as const

test('every server frame fixture survives a round trip through the decoder', () => {
  for (const kind of SERVER_FRAME_KINDS) {
    const frame = serverFrameFixtures[kind]
    const decoded = decodeServerFrame(JSON.stringify(frame))
    assert.equal(decoded.ok, true, `${kind} failed to decode`)
    if (decoded.ok) {
      assert.deepEqual(decoded.frame, frame)
    }
  }
})

test('every client frame fixture encodes to parseable JSON that keeps its tag', () => {
  for (const kind of CLIENT_FRAME_KINDS) {
    const frame = clientFrameFixtures[kind]
    const parsed: unknown = JSON.parse(encodeClientFrame(frame))
    assert.deepEqual(parsed, frame)
  }
})

test('the decoder rejects malformed JSON and malformed frames differently', () => {
  assert.deepEqual(decodeServerFrame('{not json'), { ok: false, reason: 'invalid_json' })
  assert.deepEqual(decodeServerFrame('{"t":"nope"}'), { ok: false, reason: 'invalid_frame' })
  assert.deepEqual(decodeServerFrame('{"t":"pong","extra":1}'), {
    ok: false,
    reason: 'invalid_frame',
  })
})

test('the decoder rejects a session id that is not 16 ASCII bytes', () => {
  const short = JSON.stringify({ t: 'truncated', sid: 'too_short' })
  assert.equal(decodeServerFrame(short).ok, false)
})

test('an error frame may carry a null sid but a truncated frame may not', () => {
  const nullSid = JSON.stringify({ t: 'error', sid: null, code: 'internal_error', message: 'x' })
  assert.equal(decodeServerFrame(nullSid).ok, true)
  assert.equal(decodeServerFrame(JSON.stringify({ t: 'truncated', sid: null })).ok, false)
})

test('terminal output splits into the session id and the raw remaining bytes', () => {
  const decoded = decodeTerminalOutput(binaryOutputFixture(sessionFixture.id))
  assert.notEqual(decoded, null)
  assert.equal(decoded?.sid, sessionFixture.id)
  assert.equal(
    new TextDecoder().decode(decoded?.bytes),
    'total 4\r\ndrwxr-xr-x 3 app app 4096 web\r\n',
  )
})

test('terminal output shorter than the prefix is rejected rather than truncated', () => {
  assert.equal(decodeTerminalOutput(new Uint8Array(BINARY_SID_BYTES - 1)), null)
})

test('an empty payload after the prefix decodes to zero bytes, not null', () => {
  const frame = new Uint8Array(BINARY_SID_BYTES)
  frame.set(new TextEncoder().encode(sessionFixture.id))
  const decoded = decodeTerminalOutput(frame)
  assert.equal(decoded?.sid, sessionFixture.id)
  assert.equal(decoded?.bytes.length, 0)
})

test('a non-ASCII prefix is rejected instead of producing a corrupt session id', () => {
  const frame = new Uint8Array(BINARY_SID_BYTES + 1)
  frame.fill(0xff, 0, BINARY_SID_BYTES)
  assert.equal(decodeTerminalOutput(frame), null)
})

test('a multi-byte character split across two frames is not corrupted', () => {
  const encoded = new TextEncoder().encode('é')
  const first = new Uint8Array(BINARY_SID_BYTES + 1)
  first.set(new TextEncoder().encode(sessionFixture.id))
  first.set(encoded.subarray(0, 1), BINARY_SID_BYTES)
  const second = new Uint8Array(BINARY_SID_BYTES + 1)
  second.set(new TextEncoder().encode(sessionFixture.id))
  second.set(encoded.subarray(1, 2), BINARY_SID_BYTES)

  const joined = new Uint8Array([
    ...(decodeTerminalOutput(first)?.bytes ?? []),
    ...(decodeTerminalOutput(second)?.bytes ?? []),
  ])
  assert.equal(new TextDecoder().decode(joined), 'é')
})

test('resize is clamped into the range the server will accept', () => {
  assert.deepEqual(clampResize(0, 0), { cols: FRAME_LIMITS.minCols, rows: FRAME_LIMITS.minRows })
  assert.deepEqual(clampResize(9_999, 9_999), {
    cols: FRAME_LIMITS.maxCols,
    rows: FRAME_LIMITS.maxRows,
  })
  assert.deepEqual(clampResize(80.7, 24.9), { cols: 80, rows: 24 })
  assert.deepEqual(clampResize(Number.NaN, Number.NaN), {
    cols: FRAME_LIMITS.minCols,
    rows: FRAME_LIMITS.minRows,
  })
})

test('oversized input is chunked so no frame exceeds the server limit', () => {
  const chunks = chunkInput('x'.repeat(FRAME_LIMITS.inputBytes * 2 + 5))
  assert.equal(chunks.length, 3)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= FRAME_LIMITS.inputBytes)
  }
  assert.equal(chunks.join('').length, FRAME_LIMITS.inputBytes * 2 + 5)
  assert.deepEqual(chunkInput('ls -la\r'), ['ls -la\r'])
})

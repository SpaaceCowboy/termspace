import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  decodeClientFrame,
  encodeServerFrame,
  encodeTerminalOutput,
} from './frame-codec.js'

const SID = 'ses_portalui0001'

describe('decodeClientFrame', () => {
  it('decodes every valid frame category', () => {
    assert.deepEqual(decodeClientFrame(`{"t":"sub","sid":"${SID}"}`), {
      ok: true,
      frame: { t: 'sub', sid: SID },
    })
    assert.deepEqual(decodeClientFrame('{"t":"ping"}'), {
      ok: true,
      frame: { t: 'ping' },
    })
  })

  it('distinguishes malformed JSON from an invalid frame', () => {
    assert.deepEqual(decodeClientFrame('{'), {
      ok: false,
      reason: 'invalid_json',
    })
    assert.deepEqual(decodeClientFrame('{"t":"sub","sid":"short"}'), {
      ok: false,
      reason: 'invalid_frame',
    })
  })

  it('rejects unknown properties and unsafe resize dimensions', () => {
    assert.equal(
      decodeClientFrame(`{"t":"ping","extra":true}`).ok,
      false,
    )
    assert.equal(
      decodeClientFrame(
        `{"t":"resize","sid":"${SID}","cols":0,"rows":50}`,
      ).ok,
      false,
    )
  })
})

describe('outbound frame encoding', () => {
  it('serializes typed server frames as JSON', () => {
    assert.equal(encodeServerFrame({ t: 'pong' }), '{"t":"pong"}')
  })

  it('prefixes terminal bytes with an exact 16-byte ASCII session id', () => {
    const encoded = encodeTerminalOutput(SID, 'hello')
    assert.equal(encoded.subarray(0, 16).toString('ascii'), SID)
    assert.equal(encoded.subarray(16).toString('utf8'), 'hello')
  })

  it('rejects non-ASCII and incorrectly sized session ids', () => {
    assert.throws(() => encodeTerminalOutput('short', 'hello'))
    assert.throws(() => encodeTerminalOutput('ses_portalui000é', 'hello'))
  })
})

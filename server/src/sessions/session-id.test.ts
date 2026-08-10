import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BINARY_SID_BYTES } from '@termspace/contracts'

import { createSessionId, parseSessionId } from './session-id.js'

describe('session ids', () => {
  it('generates exactly 16 URL-safe ASCII bytes', () => {
    for (let index = 0; index < 100; index += 1) {
      const id = createSessionId()
      assert.equal(Buffer.byteLength(id, 'ascii'), BINARY_SID_BYTES)
      assert.match(id, /^[A-Za-z0-9_-]{16}$/)
    }
  })

  it('rejects malformed inbound ids', () => {
    assert.throws(() => parseSessionId('short'))
    assert.throws(() => parseSessionId('ses_portalui000é'))
    assert.equal(parseSessionId('ses_portalui0001'), 'ses_portalui0001')
  })
})

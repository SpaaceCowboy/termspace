import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { base64UrlToBytes, pushSupport } from './push-keys.ts'

const supported = {
  isSecureContext: true,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
}

describe('base64UrlToBytes', () => {
  it('decodes base64url, including the URL-safe alphabet', () => {
    // "ab~c?" in standard base64 is "YWJ+Yz8=", which base64url writes with
    // "-" for "+". Getting this wrong yields a key the browser rejects.
    assert.deepEqual([...base64UrlToBytes('YWJ-Yz8')], [...new TextEncoder().encode('ab~c?')])
  })

  it('handles every padding length', () => {
    for (const [encoded, expected] of [
      ['YQ', 'a'],
      ['YWI', 'ab'],
      ['YWJj', 'abc'],
    ] as const) {
      assert.deepEqual([...base64UrlToBytes(encoded)], [...new TextEncoder().encode(expected)])
    }
  })
})

describe('pushSupport', () => {
  it('reports unsupported outside a secure context', () => {
    // Push needs HTTPS or localhost. Without this the UI offers a button that
    // silently does nothing on a LAN address.
    assert.equal(pushSupport({ ...supported, isSecureContext: false }), 'unsupported')
  })

  it('reports unsupported when any piece of the API is missing', () => {
    assert.equal(pushSupport({ ...supported, hasServiceWorker: false }), 'unsupported')
    assert.equal(pushSupport({ ...supported, hasPushManager: false }), 'unsupported')
    assert.equal(pushSupport({ ...supported, hasNotification: false }), 'unsupported')
  })

  it('passes through a decided permission', () => {
    assert.equal(pushSupport({ ...supported, permission: 'granted' }), 'granted')
    assert.equal(pushSupport({ ...supported, permission: 'denied' }), 'denied')
    assert.equal(pushSupport(supported), 'default')
  })
})

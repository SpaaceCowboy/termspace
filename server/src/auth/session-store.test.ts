import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AuthSessionStore } from './session-store.js'

const TOKEN_ONE = 'A'.repeat(43)
const TOKEN_TWO = 'B'.repeat(43)

describe('AuthSessionStore', () => {
  it('resolves an issued opaque token until expiry', () => {
    const tokens = [TOKEN_ONE]
    const store = new AuthSessionStore({
      ttlMs: 1_000,
      createToken: () => tokens.shift() ?? TOKEN_TWO,
    })

    const session = store.create('user-1', 100)

    assert.deepEqual(session, { token: TOKEN_ONE, expiresAt: 1_100 })
    assert.equal(store.resolve(TOKEN_ONE, 1_099), 'user-1')
    assert.equal(store.resolve(TOKEN_ONE, 1_100), null)
  })

  it('revokes a token without affecting another session', () => {
    const tokens = [TOKEN_ONE, TOKEN_TWO]
    const store = new AuthSessionStore({
      ttlMs: 1_000,
      createToken: () => tokens.shift() ?? TOKEN_TWO,
    })
    store.create('user-1', 100)
    store.create('user-2', 100)

    store.revoke(TOKEN_ONE)

    assert.equal(store.resolve(TOKEN_ONE, 101), null)
    assert.equal(store.resolve(TOKEN_TWO, 101), 'user-2')
  })

  it('rejects malformed tokens at the inbound boundary', () => {
    const store = new AuthSessionStore({ ttlMs: 1_000 })
    assert.equal(store.resolve('not-a-token', 100), null)
  })
})

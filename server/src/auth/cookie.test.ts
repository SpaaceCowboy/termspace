import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  clearAuthCookie,
  readAuthCookie,
  serializeAuthCookie,
} from './cookie.js'

const TOKEN = 'A'.repeat(43)

describe('auth cookie codec', () => {
  it('sets an opaque token with strict security attributes', () => {
    assert.equal(
      serializeAuthCookie(TOKEN, 3_600_000),
      `termspace_session=${TOKEN}; Path=/; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`,
    )
  })

  it('extracts only a valid Termspace token', () => {
    assert.equal(
      readAuthCookie(`other=value; termspace_session=${TOKEN}; final=value`),
      TOKEN,
    )
    assert.equal(readAuthCookie('termspace_session=invalid'), null)
    assert.equal(readAuthCookie(undefined), null)
  })

  it('clears the cookie using the same scope and security attributes', () => {
    assert.equal(
      clearAuthCookie(),
      'termspace_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict',
    )
  })
})

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CLIENT_ERROR_PREFIX, ERROR_CODES, isErrorCode } from './errors.js'
import { apiErrorFixture, errorCodeFixture } from './fixtures.js'

test('the error code union has no duplicates', () => {
  assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length)
})

test('no server error code uses the reserved client prefix', () => {
  for (const code of ERROR_CODES) {
    assert.ok(
      !code.startsWith(CLIENT_ERROR_PREFIX),
      `${code} collides with the client-only namespace`,
    )
  }
})

test('isErrorCode accepts every member and rejects anything else', () => {
  for (const code of ERROR_CODES) {
    assert.ok(isErrorCode(code))
  }
  assert.equal(isErrorCode('client_network_unreachable'), false)
  assert.equal(isErrorCode('not_a_real_code'), false)
  assert.equal(isErrorCode(''), false)
})

test('the shipped ApiError fixture carries a code the frontend can switch on', () => {
  assert.ok(isErrorCode(apiErrorFixture.code))
  assert.ok(isErrorCode(errorCodeFixture))
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { LoginRateLimiter } from './login-rate-limiter.js'

describe('LoginRateLimiter', () => {
  it('blocks a key after the configured number of failures', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 2, windowMs: 1_000 })

    assert.deepEqual(limiter.check('client', 100), { allowed: true })
    limiter.recordFailure('client', 100)
    assert.deepEqual(limiter.check('client', 200), { allowed: true })
    limiter.recordFailure('client', 200)
    assert.deepEqual(limiter.check('client', 300), {
      allowed: false,
      retryAfterMs: 800,
    })
  })

  it('allows attempts after the window and resets on success', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 1_000 })

    limiter.recordFailure('client', 100)
    assert.deepEqual(limiter.check('client', 1_100), { allowed: true })

    limiter.recordFailure('client', 1_200)
    limiter.reset('client')
    assert.deepEqual(limiter.check('client', 1_201), { allowed: true })
  })

  it('tracks clients independently', () => {
    const limiter = new LoginRateLimiter({ maxAttempts: 1, windowMs: 1_000 })

    limiter.recordFailure('one', 100)
    assert.equal(limiter.check('one', 200).allowed, false)
    assert.deepEqual(limiter.check('two', 200), { allowed: true })
  })
})

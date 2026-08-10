import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BACKOFF, backoffDelayMs, hasGivenUp } from './backoff.ts'

test('the delay grows exponentially when jitter is at its maximum', () => {
  assert.equal(backoffDelayMs(1, () => 1), 500)
  assert.equal(backoffDelayMs(2, () => 1), 1_000)
  assert.equal(backoffDelayMs(3, () => 1), 2_000)
  assert.equal(backoffDelayMs(4, () => 1), 4_000)
})

test('the delay is capped no matter how many attempts have failed', () => {
  assert.equal(backoffDelayMs(50, () => 1), BACKOFF.maxMs)
  assert.equal(backoffDelayMs(Number.MAX_SAFE_INTEGER, () => 1), BACKOFF.maxMs)
})

test('full jitter can return zero and never exceeds the exponential', () => {
  assert.equal(backoffDelayMs(5, () => 0), 0)
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const ceiling = Math.min(BACKOFF.maxMs, BACKOFF.baseMs * 2 ** (attempt - 1))
    for (const draw of [0, 0.25, 0.5, 0.99, 1]) {
      const delay = backoffDelayMs(attempt, () => draw)
      assert.ok(delay >= 0 && delay <= ceiling, `attempt ${attempt} draw ${draw} gave ${delay}`)
    }
  }
})

test('a zeroth or negative attempt is treated as the first retry', () => {
  assert.equal(backoffDelayMs(0, () => 1), 500)
  assert.equal(backoffDelayMs(-3, () => 1), 500)
})

test('the client gives up only after the configured attempt ceiling', () => {
  assert.equal(hasGivenUp(BACKOFF.maxAttempts), false)
  assert.equal(hasGivenUp(BACKOFF.maxAttempts + 1), true)
})

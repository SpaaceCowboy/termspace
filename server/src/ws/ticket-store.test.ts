import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { TicketStore } from './ticket-store.js'

const TICKET_ONE = 'A'.repeat(43)

describe('TicketStore', () => {
  it('redeems a ticket once for its bound user', () => {
    const store = new TicketStore({
      ttlMs: 10_000,
      createToken: () => TICKET_ONE,
    })
    const issued = store.issue('user-1', 100)

    assert.deepEqual(issued, { ticket: TICKET_ONE, expiresAt: 10_100 })
    assert.deepEqual(store.redeem(TICKET_ONE, 10_099), {
      ok: true,
      userId: 'user-1',
    })
    assert.deepEqual(store.redeem(TICKET_ONE, 10_099), {
      ok: false,
      reason: 'invalid',
    })
  })

  it('distinguishes an expired ticket and consumes it', () => {
    const store = new TicketStore({
      ttlMs: 10_000,
      createToken: () => TICKET_ONE,
    })
    store.issue('user-1', 100)

    assert.deepEqual(store.redeem(TICKET_ONE, 10_100), {
      ok: false,
      reason: 'expired',
    })
    assert.deepEqual(store.redeem(TICKET_ONE, 10_101), {
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects malformed ticket input', () => {
    const store = new TicketStore({ ttlMs: 10_000 })
    assert.deepEqual(store.redeem('bad-ticket', 100), {
      ok: false,
      reason: 'invalid',
    })
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { TicketRedemption } from './ticket-store.js'
import { authorizeWebSocketUpgrade } from './upgrade-auth.js'

const TICKET = 'A'.repeat(43)

class RecordingTickets {
  readonly redeemed: string[] = []
  result: TicketRedemption = { ok: true, userId: 'user-1' }

  redeem(ticket: string): TicketRedemption {
    this.redeemed.push(ticket)
    return this.result
  }
}

describe('authorizeWebSocketUpgrade', () => {
  it('accepts an exact Origin and consumes the single-use ticket', () => {
    const tickets = new RecordingTickets()
    assert.deepEqual(
      authorizeWebSocketUpgrade(
        { origin: 'https://termspace.example', url: `/ws?ticket=${TICKET}` },
        'https://termspace.example',
        tickets,
      ),
      { ok: true, userId: 'user-1' },
    )
    assert.deepEqual(tickets.redeemed, [TICKET])
  })

  it('rejects a foreign Origin without burning the ticket', () => {
    const tickets = new RecordingTickets()
    assert.deepEqual(
      authorizeWebSocketUpgrade(
        { origin: 'https://evil.example', url: `/ws?ticket=${TICKET}` },
        'https://termspace.example',
        tickets,
      ),
      { ok: false, reason: 'origin_rejected' },
    )
    assert.deepEqual(tickets.redeemed, [])
  })

  it('rejects missing, expired, and reused tickets', () => {
    const tickets = new RecordingTickets()
    assert.deepEqual(
      authorizeWebSocketUpgrade(
        { origin: 'https://termspace.example', url: '/ws' },
        'https://termspace.example',
        tickets,
      ),
      { ok: false, reason: 'ticket_invalid' },
    )

    tickets.result = { ok: false, reason: 'expired' }
    assert.deepEqual(
      authorizeWebSocketUpgrade(
        { origin: 'https://termspace.example', url: `/ws?ticket=${TICKET}` },
        'https://termspace.example',
        tickets,
      ),
      { ok: false, reason: 'ticket_expired' },
    )

    tickets.result = { ok: false, reason: 'invalid' }
    assert.deepEqual(
      authorizeWebSocketUpgrade(
        { origin: 'https://termspace.example', url: `/ws?ticket=${TICKET}` },
        'https://termspace.example',
        tickets,
      ),
      { ok: false, reason: 'ticket_invalid' },
    )
  })

  it('rejects any path other than /ws', () => {
    const tickets = new RecordingTickets()
    assert.deepEqual(
      authorizeWebSocketUpgrade(
        {
          origin: 'https://termspace.example',
          url: `/other?ticket=${TICKET}`,
        },
        'https://termspace.example',
        tickets,
      ),
      { ok: false, reason: 'not_found' },
    )
  })
})

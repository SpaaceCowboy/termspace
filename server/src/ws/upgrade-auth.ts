import { z } from 'zod'

import { isAllowedOrigin } from './origin.js'
import type { TicketRedemption } from './ticket-store.js'

const RequestSchema = z.object({
  origin: z.unknown(),
  url: z.string().max(2_048),
})

const TicketSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

interface TicketRedeemer {
  redeem(ticket: string): TicketRedemption
}

export type UpgradeAuthorization =
  | { readonly ok: true; readonly userId: string }
  | {
      readonly ok: false
      readonly reason:
        | 'not_found'
        | 'origin_rejected'
        | 'ticket_expired'
        | 'ticket_invalid'
    }

export function authorizeWebSocketUpgrade(
  untrustedRequest: unknown,
  allowedOrigin: string,
  tickets: TicketRedeemer,
): UpgradeAuthorization {
  const request = RequestSchema.safeParse(untrustedRequest)
  if (!request.success) {
    return { ok: false, reason: 'ticket_invalid' }
  }

  let url: URL
  try {
    url = new URL(request.data.url, 'http://termspace.internal')
  } catch {
    return { ok: false, reason: 'ticket_invalid' }
  }
  if (url.pathname !== '/ws') {
    return { ok: false, reason: 'not_found' }
  }
  if (!isAllowedOrigin(request.data.origin, allowedOrigin)) {
    return { ok: false, reason: 'origin_rejected' }
  }

  const ticketValues = url.searchParams.getAll('ticket')
  if (ticketValues.length !== 1 || [...url.searchParams.keys()].some((key) => key !== 'ticket')) {
    return { ok: false, reason: 'ticket_invalid' }
  }
  const ticket = TicketSchema.safeParse(ticketValues[0])
  if (!ticket.success) {
    return { ok: false, reason: 'ticket_invalid' }
  }

  const redemption = tickets.redeem(ticket.data)
  if (redemption.ok) {
    return { ok: true, userId: redemption.userId }
  }
  return {
    ok: false,
    reason: redemption.reason === 'expired' ? 'ticket_expired' : 'ticket_invalid',
  }
}

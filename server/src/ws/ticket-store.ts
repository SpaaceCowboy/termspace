import { createHash, randomBytes } from 'node:crypto'

import { z } from 'zod'

const TicketSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

const OptionsSchema = z.object({
  ttlMs: z.number().int().positive(),
  createToken: z.function({ input: [], output: z.string() }).optional(),
})

interface StoredTicket {
  readonly expiresAt: number
  readonly userId: string
}

export interface IssuedTicket {
  readonly expiresAt: number
  readonly ticket: string
}

export type TicketRedemption =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: 'expired' | 'invalid' }

export class TicketStore {
  readonly #createToken: () => string
  readonly #tickets = new Map<string, StoredTicket>()
  readonly #ttlMs: number

  constructor(untrustedOptions: z.input<typeof OptionsSchema>) {
    const options = OptionsSchema.parse(untrustedOptions)
    this.#ttlMs = options.ttlMs
    this.#createToken = options.createToken ?? createTicket
  }

  issue(userId: string, now: number = Date.now()): IssuedTicket {
    this.#prune(now)
    const ticket = TicketSchema.parse(this.#createToken())
    const expiresAt = now + this.#ttlMs
    this.#tickets.set(hashTicket(ticket), { expiresAt, userId })
    return { expiresAt, ticket }
  }

  redeem(untrustedTicket: string, now: number = Date.now()): TicketRedemption {
    const parsed = TicketSchema.safeParse(untrustedTicket)
    if (!parsed.success) {
      return { ok: false, reason: 'invalid' }
    }
    const digest = hashTicket(parsed.data)
    const ticket = this.#tickets.get(digest)
    if (ticket === undefined) {
      return { ok: false, reason: 'invalid' }
    }
    this.#tickets.delete(digest)
    if (now >= ticket.expiresAt) {
      return { ok: false, reason: 'expired' }
    }
    return { ok: true, userId: ticket.userId }
  }

  #prune(now: number): void {
    for (const [digest, ticket] of this.#tickets) {
      if (now >= ticket.expiresAt) {
        this.#tickets.delete(digest)
      }
    }
  }
}

function createTicket(): string {
  return randomBytes(32).toString('base64url')
}

function hashTicket(ticket: string): string {
  return createHash('sha256').update(ticket).digest('base64url')
}

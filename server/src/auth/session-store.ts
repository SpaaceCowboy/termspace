import { createHash, randomBytes } from 'node:crypto'

import { z } from 'zod'

const SessionTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/)

const OptionsSchema = z.object({
  ttlMs: z.number().int().positive(),
  createToken: z.function({ input: [], output: z.string() }).optional(),
})

interface StoredSession {
  readonly expiresAt: number
  readonly userId: string
}

export interface CreatedAuthSession {
  readonly expiresAt: number
  readonly token: string
}

export class AuthSessionStore {
  readonly #createToken: () => string
  readonly #sessions = new Map<string, StoredSession>()
  readonly #ttlMs: number

  constructor(untrustedOptions: z.input<typeof OptionsSchema>) {
    const options = OptionsSchema.parse(untrustedOptions)
    this.#ttlMs = options.ttlMs
    this.#createToken = options.createToken ?? createSessionToken
  }

  create(userId: string, now: number = Date.now()): CreatedAuthSession {
    this.#prune(now)
    const token = SessionTokenSchema.parse(this.#createToken())
    const expiresAt = now + this.#ttlMs
    this.#sessions.set(hashToken(token), { expiresAt, userId })
    return { expiresAt, token }
  }

  resolve(untrustedToken: string, now: number = Date.now()): string | null {
    const parsed = SessionTokenSchema.safeParse(untrustedToken)
    if (!parsed.success) {
      return null
    }
    const digest = hashToken(parsed.data)
    const session = this.#sessions.get(digest)
    if (session === undefined) {
      return null
    }
    if (now >= session.expiresAt) {
      this.#sessions.delete(digest)
      return null
    }
    return session.userId
  }

  revoke(untrustedToken: string): void {
    const parsed = SessionTokenSchema.safeParse(untrustedToken)
    if (parsed.success) {
      this.#sessions.delete(hashToken(parsed.data))
    }
  }

  #prune(now: number): void {
    for (const [digest, session] of this.#sessions) {
      if (now >= session.expiresAt) {
        this.#sessions.delete(digest)
      }
    }
  }
}

function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

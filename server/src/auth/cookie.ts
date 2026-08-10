import { z } from 'zod'

const AUTH_COOKIE_NAME = 'termspace_session'
const CookieHeaderSchema = z.string().max(8_192)
const SessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export function serializeAuthCookie(
  untrustedToken: string,
  ttlMs: number,
): string {
  const token = SessionTokenSchema.parse(untrustedToken)
  const maxAgeSeconds = z.number().int().positive().parse(Math.floor(ttlMs / 1_000))
  return `${AUTH_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=Strict`
}

export function clearAuthCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
}

export function readAuthCookie(untrustedHeader: unknown): string | null {
  const header = CookieHeaderSchema.safeParse(untrustedHeader)
  if (!header.success) {
    return null
  }

  for (const component of header.data.split(';')) {
    const separator = component.indexOf('=')
    if (separator === -1) {
      continue
    }
    const name = component.slice(0, separator).trim()
    if (name !== AUTH_COOKIE_NAME) {
      continue
    }
    const token = SessionTokenSchema.safeParse(component.slice(separator + 1).trim())
    return token.success ? token.data : null
  }
  return null
}

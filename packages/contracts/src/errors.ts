export const ERROR_CODES = [
  'unauthorized',
  'invalid_credentials',
  'rate_limited',
  'ticket_invalid',
  'ticket_expired',
  'origin_rejected',
  'session_not_found',
  'session_dead',
  'validation_failed',
  'internal_error',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/**
 * `ApiError.code` stays `string` on the wire so an unknown code from a newer
 * server does not fail parsing. Narrow with this before switching, and keep a
 * default branch.
 */
export function isErrorCode(code: string): code is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(code)
}

/**
 * Reserved for codes the client mints when the server produced no valid
 * envelope at all. The server must never send a code with this prefix.
 */
export const CLIENT_ERROR_PREFIX = 'client_'

import { randomBytes } from 'node:crypto'

import { BINARY_SID_BYTES } from '@termspace/contracts'
import { z } from 'zod'

const SessionIdSchema = z
  .string()
  .length(BINARY_SID_BYTES)
  .regex(/^[A-Za-z0-9_-]+$/)

export function createSessionId(): string {
  return SessionIdSchema.parse(randomBytes(12).toString('base64url'))
}

export function parseSessionId(untrustedId: unknown): string {
  return SessionIdSchema.parse(untrustedId)
}

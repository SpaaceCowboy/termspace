import { randomUUID } from 'node:crypto'

import { argon2id, hash } from 'argon2'
import type Database from 'better-sqlite3'
import { generateSecret, generateURI } from 'otplib'
import { z } from 'zod'

const SeedUserInputSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(12).max(1_024),
})

const StoredUserSchema = z.object({ id: z.uuid() })

export interface SeedUserResult {
  readonly id: string
  readonly otpauthUrl: string
}

export async function seedUser(
  database: Database.Database,
  untrustedInput: z.input<typeof SeedUserInputSchema>,
): Promise<SeedUserResult> {
  const input = SeedUserInputSchema.parse(untrustedInput)
  const passwordHash = await hash(input.password, { type: argon2id })
  const totpSecret = generateSecret()

  const storedUser = StoredUserSchema.parse(
    database
      .prepare(
        `INSERT INTO users (id, username, password_hash, totp_secret, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET
           password_hash = excluded.password_hash,
           totp_secret = excluded.totp_secret
         RETURNING id`,
      )
      .get(randomUUID(), input.username, passwordHash, totpSecret, Date.now()),
  )

  return {
    id: storedUser.id,
    otpauthUrl: generateURI({
      issuer: 'Termspace',
      label: input.username,
      secret: totpSecret,
    }),
  }
}

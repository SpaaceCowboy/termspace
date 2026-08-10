import type { User } from '@termspace/contracts'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const UserRowSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    created_at: z.number().int(),
  })
  .transform(
    (row): User => ({
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
    }),
  )

const UserCredentialsRowSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    password_hash: z.string(),
    totp_secret: z.string(),
    created_at: z.number().int(),
  })
  .transform((row) => ({
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    totpSecret: row.totp_secret,
    createdAt: row.created_at,
  }))

export type UserCredentials = z.output<typeof UserCredentialsRowSchema>

export class UserRepository {
  readonly #database: Database.Database

  constructor(database: Database.Database) {
    this.#database = database
  }

  findCredentialsByUsername(username: string): UserCredentials | null {
    const row = this.#database
      .prepare(
        `SELECT id, username, password_hash, totp_secret, created_at
         FROM users WHERE username = ?`,
      )
      .get(username)
    return row === undefined ? null : UserCredentialsRowSchema.parse(row)
  }

  findById(userId: string): User | null {
    const row = this.#database
      .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
      .get(userId)
    return row === undefined ? null : UserRowSchema.parse(row)
  }
}

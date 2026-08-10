import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { verify as verifyPassword } from 'argon2'
import type Database from 'better-sqlite3'
import { z } from 'zod'

import { openDatabase } from '../database/connection.js'
import { migrateDatabase } from '../database/migrations.js'
import { seedUser } from './seed-user.js'

const StoredUserSchema = z.object({
  password_hash: z.string(),
  totp_secret: z.string(),
})

describe('seedUser', () => {
  let database: Database.Database

  beforeEach(() => {
    database = openDatabase(':memory:')
    migrateDatabase(database)
  })

  afterEach(() => {
    database.close()
  })

  it('stores an argon2id hash and returns the matching otpauth URL', async () => {
    const result = await seedUser(database, {
      username: 'owner',
      password: 'correct horse battery staple',
    })

    const stored = StoredUserSchema.parse(
      database
        .prepare(
          'SELECT password_hash, totp_secret FROM users WHERE username = ?',
        )
        .get('owner'),
    )

    assert.match(stored.password_hash, /^\$argon2id\$/)
    assert.equal(
      await verifyPassword(
        stored.password_hash,
        'correct horse battery staple',
      ),
      true,
    )

    const otpauthUrl = new URL(result.otpauthUrl)
    assert.equal(otpauthUrl.protocol, 'otpauth:')
    assert.equal(otpauthUrl.searchParams.get('secret'), stored.totp_secret)
    assert.equal(otpauthUrl.searchParams.get('issuer'), 'Termspace')
  })

  it('validates seeded credentials before hashing', async () => {
    await assert.rejects(
      seedUser(database, { username: 'owner', password: 'short' }),
    )
  })
})

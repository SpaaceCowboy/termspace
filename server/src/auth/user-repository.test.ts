import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type Database from 'better-sqlite3'

import { openDatabase } from '../database/connection.js'
import { migrateDatabase } from '../database/migrations.js'
import { UserRepository } from './user-repository.js'

describe('UserRepository', () => {
  let database: Database.Database
  let repository: UserRepository

  beforeEach(() => {
    database = openDatabase(':memory:')
    migrateDatabase(database)
    database
      .prepare(
        `INSERT INTO users
          (id, username, password_hash, totp_secret, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('user-1', 'owner', 'password-hash', 'totp-secret', 100)
    repository = new UserRepository(database)
  })

  afterEach(() => {
    database.close()
  })

  it('reads internal credentials by exact username', () => {
    assert.deepEqual(repository.findCredentialsByUsername('owner'), {
      id: 'user-1',
      username: 'owner',
      passwordHash: 'password-hash',
      totpSecret: 'totp-secret',
      createdAt: 100,
    })
    assert.equal(repository.findCredentialsByUsername('Owner'), null)
  })

  it('reads only public user fields by id', () => {
    assert.deepEqual(repository.findById('user-1'), {
      id: 'user-1',
      username: 'owner',
      createdAt: 100,
    })
    assert.equal(repository.findById('missing'), null)
  })
})

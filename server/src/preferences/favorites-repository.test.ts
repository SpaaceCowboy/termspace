import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type Database from 'better-sqlite3'

import { openDatabase } from '../database/connection.js'
import { migrateDatabase } from '../database/migrations.js'
import { FavoritesRepository } from './favorites-repository.js'

describe('FavoritesRepository', () => {
  let database: Database.Database
  let repository: FavoritesRepository

  beforeEach(() => {
    database = openDatabase(':memory:')
    migrateDatabase(database)
    database.prepare(
      `INSERT INTO users (id, username, password_hash, totp_secret, created_at)
       VALUES ('u1', 'operator', 'hash', 'secret', 1)`,
    ).run()
    repository = new FavoritesRepository(database)
  })

  afterEach(() => database.close())

  it('returns an empty preference before the first save', () => {
    assert.deepEqual(repository.find('u1', new Set(), new Set()), {
      projectIds: [],
      sessionIds: [],
    })
  })

  it('preserves order, removes duplicates, and filters unknown ids', () => {
    const saved = repository.save(
      'u1',
      { projectIds: ['p2', 'missing', 'p1', 'p2'], sessionIds: ['s1', 'missing'] },
      new Set(['p1', 'p2']),
      new Set(['s1']),
      123,
    )
    assert.deepEqual(saved, { projectIds: ['p2', 'p1'], sessionIds: ['s1'] })
    assert.deepEqual(repository.find('u1', new Set(['p2']), new Set()), {
      projectIds: ['p2'],
      sessionIds: [],
    })
  })

  it('cascades preferences when their user is deleted', () => {
    repository.save('u1', { projectIds: [], sessionIds: [] }, new Set(), new Set(), 1)
    database.prepare("DELETE FROM users WHERE id = 'u1'").run()
    const count = database.prepare('SELECT COUNT(*) AS count FROM user_favorites').get() as {
      count: number
    }
    assert.equal(count.count, 0)
  })
})

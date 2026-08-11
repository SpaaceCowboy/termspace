import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { EMPTY_LAYOUT, LAYOUT_MAX_SLOTS, normalizeLayout } from '@termspace/contracts'
import type Database from 'better-sqlite3'

import { openDatabase } from '../database/connection.js'
import { migrateDatabase } from '../database/migrations.js'
import { LayoutRepository } from './layout-repository.js'

const USER_ID = 'usr_operator'
const SID_A = 'ses_aaaaaaaa0001'
const SID_B = 'ses_bbbbbbbb0002'
const LIVE = new Set([SID_A, SID_B])

describe('LayoutRepository', () => {
  let database: Database.Database
  let repository: LayoutRepository

  beforeEach(() => {
    database = openDatabase(':memory:')
    migrateDatabase(database)
    database
      .prepare(
        'INSERT INTO users (id, username, password_hash, totp_secret, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(USER_ID, 'operator', 'hash', 'secret', 1)
    repository = new LayoutRepository(database)
  })

  afterEach(() => {
    database.close()
  })

  it('gives a user who has never arranged anything the empty layout', () => {
    assert.deepEqual(repository.find(USER_ID, LIVE), EMPTY_LAYOUT)
  })

  it('round-trips a layout and overwrites it in place on the second save', () => {
    const first = normalizeLayout({ mode: 'grid', slots: [SID_A, SID_B], focusedSlot: 1 })
    repository.save(USER_ID, first, 1_000)
    assert.deepEqual(repository.find(USER_ID, LIVE), { ...first, updatedAt: 1_000 })

    const second = normalizeLayout({ mode: 'tabs', slots: [SID_B], focusedSlot: 0 })
    const saved = repository.save(USER_ID, second, 2_000)
    assert.deepEqual(saved, { ...second, updatedAt: 2_000 })
    assert.deepEqual(repository.find(USER_ID, LIVE), saved)
    assert.equal(countRows(database), 1, 'the second save must not add a row')
  })

  it('empties slots whose session has since been deleted', () => {
    repository.save(
      USER_ID,
      normalizeLayout({ mode: 'grid', slots: [SID_A, SID_B], focusedSlot: 0 }),
      1_000,
    )
    const found = repository.find(USER_ID, new Set([SID_B]))
    assert.deepEqual(found.slots.slice(0, 2), [null, SID_B])
    assert.equal(found.focusedSlot, 1)
  })

  it('falls back to the empty layout when the stored JSON is not a layout', () => {
    database
      .prepare('INSERT INTO layouts (user_id, data, updated_at) VALUES (?, ?, ?)')
      .run(USER_ID, '{"mode":"mosaic"}', 5_000)
    assert.deepEqual(repository.find(USER_ID, LIVE), EMPTY_LAYOUT)
  })

  it('normalizes a layout stored by an older build rather than serving it raw', () => {
    const overlong = JSON.stringify({
      mode: 'grid',
      slots: [SID_A, SID_A, ...new Array(LAYOUT_MAX_SLOTS).fill(null)],
      focusedSlot: 99,
    })
    database
      .prepare('INSERT INTO layouts (user_id, data, updated_at) VALUES (?, ?, ?)')
      .run(USER_ID, overlong, 5_000)

    const found = repository.find(USER_ID, LIVE)
    assert.equal(found.slots.length, LAYOUT_MAX_SLOTS)
    assert.deepEqual(found.slots.slice(0, 2), [SID_A, null], 'the duplicate is emptied')
    assert.equal(found.focusedSlot, 0)
    assert.equal(found.updatedAt, 5_000)
  })

  it('keeps one user’s layout out of another’s', () => {
    database
      .prepare(
        'INSERT INTO users (id, username, password_hash, totp_secret, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('usr_other', 'other', 'hash', 'secret', 1)
    repository.save(
      USER_ID,
      normalizeLayout({ mode: 'grid', slots: [SID_A], focusedSlot: 0 }),
      1_000,
    )
    assert.deepEqual(repository.find('usr_other', LIVE), EMPTY_LAYOUT)
  })
})

function countRows(database: Database.Database): number {
  const row = database.prepare('SELECT COUNT(*) AS count FROM layouts').get()
  return (row as { count: number }).count
}

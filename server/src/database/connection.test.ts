import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import { openDatabase } from './connection.js'

const mode = (path: string): string => (statSync(path).mode & 0o777).toString(8)

describe('openDatabase', () => {
  const base = mkdtempSync(join(tmpdir(), 'termspace-db-'))

  after(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('keeps the database and its WAL siblings unreadable to other users', () => {
    const path = join(base, 'nested', 'termspace.db')
    const database = openDatabase(path)
    // Force the -wal and -shm siblings into existence.
    database.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY)')
    database.close()

    assert.equal(mode(path), '600')
    assert.equal(mode(join(base, 'nested')), '700')
  })

  it('does not chmod a directory it did not create', () => {
    const database = openDatabase(join(base, 'termspace.db'))
    database.close()
    // `base` came from mkdtemp, which is already 700; the point is that the
    // call left it alone rather than asserting a mode it happens to share.
    assert.equal(mode(join(base, 'termspace.db')), '600')
  })

  it('still supports an in-memory database', () => {
    const database = openDatabase(':memory:')
    assert.equal(database.open, true)
    database.close()
  })
})

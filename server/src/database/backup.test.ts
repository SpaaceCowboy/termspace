import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import Database from 'better-sqlite3'

import { createDatabaseBackup, verifyDatabaseBackup } from './backup.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('database backup', () => {
  it('captures committed WAL contents while the source remains open', async () => {
    const root = await temporaryRoot()
    const sourcePath = join(root, 'live.sqlite3')
    const backupDirectory = join(root, 'backups')
    const live = new Database(sourcePath)
    live.pragma('journal_mode = WAL')
    live.exec('CREATE TABLE records (value TEXT NOT NULL) STRICT')
    live.prepare('INSERT INTO records (value) VALUES (?)').run('from-wal')

    const result = await createDatabaseBackup({
      sourcePath,
      backupDirectory,
      retentionCount: 14,
      now: () => new Date('2026-08-17T12:00:00.000Z'),
    })

    assert.equal(live.open, true)
    verifyDatabaseBackup(result.path)
    const restored = new Database(result.path, { readonly: true })
    assert.deepEqual(restored.prepare('SELECT value FROM records').all(), [{ value: 'from-wal' }])
    restored.close()
    live.close()
    assert.equal((await stat(result.path)).mode & 0o777, 0o600)
    assert.equal((await stat(backupDirectory)).mode & 0o777, 0o700)
  })

  it('retains only the configured number of successful snapshots', async () => {
    const root = await temporaryRoot()
    const sourcePath = join(root, 'live.sqlite3')
    const backupDirectory = join(root, 'backups')
    const source = new Database(sourcePath)
    source.exec('CREATE TABLE records (value TEXT NOT NULL) STRICT')
    source.close()

    for (const hour of [10, 11, 12]) {
      await createDatabaseBackup({
        sourcePath,
        backupDirectory,
        retentionCount: 2,
        now: () => new Date(`2026-08-17T${hour}:00:00.000Z`),
      })
    }

    assert.deepEqual(await readdir(backupDirectory), [
      'termspace-2026-08-17T11-00-00.000Z.sqlite3',
      'termspace-2026-08-17T12-00-00.000Z.sqlite3',
    ])
  })

  it('refuses a duplicate timestamp rather than replacing a backup', async () => {
    const root = await temporaryRoot()
    const sourcePath = join(root, 'live.sqlite3')
    const backupDirectory = join(root, 'backups')
    const source = new Database(sourcePath)
    source.exec('CREATE TABLE records (value TEXT NOT NULL) STRICT')
    source.close()
    const options = {
      sourcePath,
      backupDirectory,
      retentionCount: 2,
      now: () => new Date('2026-08-17T12:00:00.000Z'),
    }

    await createDatabaseBackup(options)
    await assert.rejects(createDatabaseBackup(options), { code: 'EEXIST' })
    assert.deepEqual(await readdir(backupDirectory), [
      'termspace-2026-08-17T12-00-00.000Z.sqlite3',
    ])
  })
})

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'termspace-backup-'))
  roots.push(root)
  return root
}

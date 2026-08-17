import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'

import { createDatabaseBackup, verifyDatabaseBackup } from './dist/database/backup.js'

const root = await mkdtemp(join(tmpdir(), 'termspace-backup-e2e-'))
const sourcePath = join(root, 'termspace.db')
const backupDirectory = join(root, 'backups')
const restoredPath = join(root, 'restored.db')
const live = new Database(sourcePath)

try {
  live.pragma('journal_mode = WAL')
  live.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
    CREATE TABLE sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL) STRICT;
    INSERT INTO projects VALUES ('project-one', 'One');
    INSERT INTO sessions VALUES ('session-one', 'project-one');
  `)

  const result = await createDatabaseBackup({
    sourcePath,
    backupDirectory,
    retentionCount: 14,
  })
  assert.equal(live.open, true, 'online backup closed the live gateway database')
  verifyDatabaseBackup(result.path)
  await copyFile(result.path, restoredPath)
  verifyDatabaseBackup(restoredPath)

  const restored = new Database(restoredPath, { readonly: true })
  assert.deepEqual(restored.prepare('SELECT id, name FROM projects').all(), [
    { id: 'project-one', name: 'One' },
  ])
  assert.deepEqual(restored.prepare('SELECT id, project_id FROM sessions').all(), [
    { id: 'session-one', project_id: 'project-one' },
  ])
  restored.close()
  assert.equal((await stat(result.path)).mode & 0o777, 0o600)
  console.log('6/6 live backup and restore checks passed')
} finally {
  live.close()
  await rm(root, { recursive: true, force: true })
}

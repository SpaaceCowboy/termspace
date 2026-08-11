import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import Database from 'better-sqlite3'

/**
 * The database holds argon2 hashes and TOTP secrets. SQLite creates files 0644
 * and honours the umask for the directory, so both are tightened explicitly
 * rather than left to however the service happens to be launched.
 */
export function openDatabase(databasePath: string): Database.Database {
  if (databasePath === ':memory:') {
    return configureDatabase(new Database(databasePath))
  }

  const resolvedPath = resolve(databasePath)
  const directory = dirname(resolvedPath)
  // Only tighten a directory we created ourselves — the configured path may
  // point into somewhere shared, and silently chmodding that is not ours to do.
  const created = mkdirSync(directory, { recursive: true, mode: 0o700 })
  if (created !== undefined) {
    chmodSync(created, 0o700)
  }
  const database = configureDatabase(new Database(resolvedPath))
  // WAL mode adds -wal and -shm siblings; they carry the same contents.
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      chmodSync(`${resolvedPath}${suffix}`, 0o600)
    } catch {
      // -wal and -shm only exist once WAL is active; missing is not a failure.
    }
  }
  return database
}

function configureDatabase(database: Database.Database): Database.Database {
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 5000')
  return database
}

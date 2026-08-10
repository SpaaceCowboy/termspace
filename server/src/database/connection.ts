import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import Database from 'better-sqlite3'

export function openDatabase(databasePath: string): Database.Database {
  if (databasePath === ':memory:') {
    return configureDatabase(new Database(databasePath))
  }

  const resolvedPath = resolve(databasePath)
  mkdirSync(dirname(resolvedPath), { recursive: true })
  return configureDatabase(new Database(resolvedPath))
}

function configureDatabase(database: Database.Database): Database.Database {
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma('busy_timeout = 5000')
  return database
}

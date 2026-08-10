import { readEnvironment } from '../config/env.js'
import { openDatabase } from './connection.js'
import { migrateDatabase } from './migrations.js'

const environment = readEnvironment()
const database = openDatabase(environment.TERMSPACE_DATABASE_PATH)

try {
  const result = migrateDatabase(database)
  process.stdout.write(
    `Database schema is at version ${result.currentVersion}; applied ${result.applied.length} migration(s).\n`,
  )
} finally {
  database.close()
}

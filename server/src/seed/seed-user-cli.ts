import { readEnvironment } from '../config/env.js'
import { openDatabase } from '../database/connection.js'
import { migrateDatabase } from '../database/migrations.js'
import { readPassword } from './password-input.js'
import { parseSeedUserArguments } from './seed-user-arguments.js'
import { seedUser } from './seed-user.js'

async function run(): Promise<void> {
  const username = parseSeedUserArguments(process.argv.slice(2))
  const password = await readPassword()
  const environment = readEnvironment()
  const database = openDatabase(environment.TERMSPACE_DATABASE_PATH)

  try {
    migrateDatabase(database)
    const result = await seedUser(database, { username, password })
    process.stdout.write(`${result.otpauthUrl}\n`)
  } finally {
    database.close()
  }
}

try {
  await run()
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown seed error'
  process.stderr.write(`Unable to seed user: ${message}\n`)
  process.exitCode = 1
}

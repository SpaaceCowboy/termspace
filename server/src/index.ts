import { readEnvironment } from './config/env.js'
import { openDatabase } from './database/connection.js'
import { migrateDatabase } from './database/migrations.js'
import { createServerRuntime } from './runtime.js'

async function start(): Promise<void> {
  const environment = readEnvironment()
  const database = openDatabase(environment.TERMSPACE_DATABASE_PATH)

  try {
    migrateDatabase(database)
    const runtime = createServerRuntime(database, environment, { logger: true })
    await runtime.app.listen({
      host: environment.TERMSPACE_HOST,
      port: environment.TERMSPACE_PORT,
    })
  } catch (error) {
    if (database.open) {
      database.close()
    }
    throw error
  }
}

try {
  await start()
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown startup error'
  process.stderr.write(`Termspace server failed to start: ${message}\n`)
  process.exitCode = 1
}

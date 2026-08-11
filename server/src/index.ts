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

    // Without a usable project root nothing can be created, and the failure
    // otherwise shows up as a confusing form error at the far end of a login.
    const root = await runtime.services.projects.ensureProjectRoot()
    if (root.created) {
      runtime.app.log.info(
        { projectRoot: environment.TERMSPACE_PROJECT_ROOT },
        'Created the project root',
      )
    }
    if (!root.writable) {
      runtime.app.log.error(
        { projectRoot: environment.TERMSPACE_PROJECT_ROOT },
        'Project root is missing or not writable — every project creation will fail. ' +
          'Set TERMSPACE_PROJECT_ROOT to a directory this user owns.',
      )
    }

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

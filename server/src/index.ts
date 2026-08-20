import { LogController } from 'fastify'

import { readEnvironment } from './config/env.js'
import { openDatabase } from './database/connection.js'
import { migrateDatabase } from './database/migrations.js'
import { createServerRuntime } from './runtime.js'
import { createLoggerOptions, safeErrorLog } from './logging/request-logging.js'

async function start(): Promise<void> {
  const environment = readEnvironment()
  const database = openDatabase(environment.TERMSPACE_DATABASE_PATH)

  try {
    migrateDatabase(database)
    const runtime = createServerRuntime(database, environment, {
      logController: new LogController({ disableRequestLogging: true }),
      logger: createLoggerOptions(environment.TERMSPACE_LOG_LEVEL),
    })

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

    runtime.app.log.info(
      { allowedOrigin: environment.TERMSPACE_ALLOWED_ORIGIN },
      'WebSocket upgrades are accepted only from this exact Origin',
    )

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
  process.stderr.write(`${JSON.stringify({
    event: 'server_start_failed',
    ...safeErrorLog(error),
  })}\n`)
  process.exitCode = 1
}

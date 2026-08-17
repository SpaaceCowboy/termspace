import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import type { ApiOk, HealthData } from '@termspace/contracts'

import { VERSION } from './version.js'
import { registerRequestLogging } from './logging/request-logging.js'

export function buildApp(
  options: FastifyServerOptions = {},
): FastifyInstance {
  const app = Fastify(options)
  registerRequestLogging(app)

  app.get('/api/health', async (): Promise<ApiOk<HealthData>> => {
    return {
      ok: true,
      data: { version: VERSION },
    }
  })

  return app
}

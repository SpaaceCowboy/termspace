import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'
import type { ApiOk, HealthData } from '@termspace/contracts'

import { VERSION } from './version.js'

export function buildApp(
  options: FastifyServerOptions = {},
): FastifyInstance {
  const app = Fastify(options)

  app.get('/api/health', async (): Promise<ApiOk<HealthData>> => {
    return {
      ok: true,
      data: { version: VERSION },
    }
  })

  return app
}

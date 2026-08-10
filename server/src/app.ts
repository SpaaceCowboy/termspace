import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify'

import { VERSION } from './version.js'

export function buildApp(
  options: FastifyServerOptions = {},
): FastifyInstance {
  const app = Fastify(options)

  app.get('/api/health', async () => ({
    ok: true,
    data: { version: VERSION },
  }))

  return app
}

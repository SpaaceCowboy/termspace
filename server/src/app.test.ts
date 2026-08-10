import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import type { FastifyInstance } from 'fastify'

import { buildApp } from './app.js'

describe('GET /api/health', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
  })

  it('returns the version in the API success envelope', async () => {
    app = buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), {
      ok: true,
      data: { version: '0.0.0' },
    })
  })
})

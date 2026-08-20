import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LogController } from 'fastify'

import { buildApp } from '../app.js'
import {
  createLoggerOptions,
  LOG_REDACTION_CENSOR,
  requestPath,
  safeErrorLog,
} from './request-logging.js'

describe('structured request logging', () => {
  it('strips every query string from request paths', () => {
    assert.equal(requestPath('/ws?ticket=secret&other=value'), '/ws')
    assert.equal(requestPath('/api/health'), '/api/health')
  })

  it('reduces errors to non-sensitive grouping fields', () => {
    const error = Object.assign(new Error('ticket-must-not-appear'), {
      code: 'SQLITE_BUSY',
      password: 'password-must-not-appear',
    })
    assert.deepEqual(safeErrorLog(error), {
      errorName: 'Error',
      errorCode: 'SQLITE_BUSY',
    })
    assert.deepEqual(safeErrorLog({ terminalBytes: 'secret' }), {
      errorName: 'NonErrorThrown',
    })
  })

  it('emits one bounded completion object without headers, bodies, or query values', async () => {
    const lines: string[] = []
    const ticket = 'ticket-must-not-appear'
    const cookie = 'session-cookie-must-not-appear'
    const password = 'password-must-not-appear'
    const app = buildApp({
      logController: new LogController({ disableRequestLogging: true }),
      logger: {
        ...createLoggerOptions('info'),
        stream: { write: (line: string) => { lines.push(line) } },
      },
    })
    app.post('/probe', async (request) => {
      request.log.info({
        password,
        totp: '123456',
        ticket,
        req: { headers: { cookie, authorization: 'Bearer secret' } },
        terminalBytes: 'terminal output must not appear',
      }, 'redaction probe')
      return { ok: true }
    })

    await app.inject({
      method: 'POST',
      url: `/probe?ticket=${ticket}`,
      headers: { cookie, authorization: 'Bearer secret' },
      payload: { password, totp: '123456' },
    })
    await app.close()

    const output = lines.join('')
    for (const secret of [ticket, cookie, password, '123456', 'Bearer secret', 'terminal output']) {
      assert.equal(output.includes(secret), false, `${secret} leaked into logs`)
    }
    assert.ok(output.includes(LOG_REDACTION_CENSOR))
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
    const completions = entries.filter((entry) => entry.event === 'http_request_complete')
    assert.equal(completions.length, 1)
    const completion = completions[0]
    assert.deepEqual(completion?.request, {
      method: 'POST',
      path: '/probe',
      route: '/probe',
      remoteAddress: '127.0.0.1',
    })
    assert.deepEqual(
      Object.keys(completion?.response as Record<string, unknown>).sort(),
      ['durationMs', 'statusCode'],
    )
  })
})

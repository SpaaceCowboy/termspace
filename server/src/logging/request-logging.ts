import type { FastifyInstance, FastifyRequest } from 'fastify'

export const LOG_REDACTION_CENSOR = '[REDACTED]'

export function createLoggerOptions(level: string) {
  return {
    level,
    redact: {
      censor: LOG_REDACTION_CENSOR,
      paths: [
        'password',
        'totp',
        'ticket',
        'cookie',
        'authorization',
        'terminalBytes',
        'sessionBytes',
        'req.headers.cookie',
        'req.headers.authorization',
        'request.headers.cookie',
        'request.headers.authorization',
        'headers.cookie',
        'headers.authorization',
        'body.password',
        'body.totp',
        'body.ticket',
        'body.initialPrompt',
      ],
    },
    serializers: {
      req: serializeRequest,
      res: (reply: { readonly statusCode: number }) => ({
        statusCode: reply.statusCode,
      }),
    },
  }
}

/** One completion record per HTTP request; headers, bodies, and query are absent. */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        event: 'http_request_complete',
        request: {
          method: request.method,
          path: requestPath(request.url),
          route: request.routeOptions.url,
          remoteAddress: request.ip,
        },
        response: {
          statusCode: reply.statusCode,
          durationMs: reply.elapsedTime,
        },
      },
      'HTTP request complete',
    )
  })
}

function serializeRequest(request: FastifyRequest | {
  readonly method?: string
  readonly url?: string
  readonly ip?: string
}): Record<string, string | undefined> {
  return {
    method: request.method,
    path: requestPath(request.url ?? ''),
    remoteAddress: request.ip,
  }
}

export function requestPath(url: string): string {
  const query = url.indexOf('?')
  return query === -1 ? url : url.slice(0, query)
}

/**
 * Error messages, stacks, command argv, and HTTP client objects can contain
 * repository credentials, push tokens, or terminal text. Keep logs useful for
 * grouping without serializing the untrusted error object.
 */
export function safeErrorLog(error: unknown): {
  readonly errorName: string
  readonly errorCode?: string | number
} {
  if (!(error instanceof Error)) {
    return { errorName: 'NonErrorThrown' }
  }
  const code = (error as Error & { readonly code?: unknown }).code
  return {
    errorName: error.name,
    ...(typeof code === 'string' || typeof code === 'number'
      ? { errorCode: code }
      : {}),
  }
}

import type {
  ApiErr,
  ApiOk,
  CreateSessionInput,
  ErrorCode,
  LoginInput,
  Session,
  User,
  WsTicket,
} from '@termspace/contracts'
import { AGENT_KINDS, BINARY_SID_BYTES } from '@termspace/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { clearAuthCookie, readAuthCookie, serializeAuthCookie } from '../auth/cookie.js'
import {
  SessionDirectoryNotFoundError,
  SessionProjectNotFoundError,
} from '../sessions/session-manager.js'

const LoginInputSchema = z
  .object({
    username: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
    password: z.string().min(1).max(1_024),
    totp: z.string().regex(/^\d{6}$/),
  })
  .strict()

const CreateSessionInputSchema = z
  .object({
    projectId: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    agent: z.enum(AGENT_KINDS),
    cwd: z.string().min(1).max(4_096).optional(),
  })
  .strict()

const SessionParamsSchema = z.object({
  id: z.string().length(BINARY_SID_BYTES).regex(/^[A-Za-z0-9_-]+$/),
})
const EmptyBodySchema = z.undefined()

interface UserReader {
  findById(userId: string): User | null
}

interface Authenticator {
  authenticate(username: string, password: string, totp: string): Promise<string | null>
}

interface AuthSessions {
  create(userId: string): { readonly token: string }
  resolve(token: string): string | null
  revoke(token: string): void
}

interface RateLimiter {
  check(key: string):
    | { readonly allowed: true }
    | { readonly allowed: false; readonly retryAfterMs: number }
  recordFailure(key: string): void
  reset(key: string): void
}

interface SessionOperations {
  create(
    projectId: string,
    name: string,
    agent: CreateSessionInput['agent'],
    cwd?: string,
  ): Promise<Session>
  delete(sessionId: string): Promise<boolean>
  list(): readonly Session[]
}

interface Tickets {
  issue(userId: string): WsTicket
}

export interface Phase1RouteServices {
  readonly auth: Authenticator
  readonly authSessionTtlMs: number
  readonly authSessions: AuthSessions
  readonly loginRateLimiter: RateLimiter
  readonly sessions: SessionOperations
  readonly tickets: Tickets
  readonly users: UserReader
}

export function registerPhase1Routes(
  app: FastifyInstance,
  services: Phase1RouteServices,
): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasClientStatusCode(error)) {
      return reply.send(
        sendError(reply, 400, 'validation_failed', 'Invalid request.'),
      )
    }
    request.log.error({ err: error }, 'HTTP request failed')
    return reply.send(
      sendError(reply, 500, 'internal_error', 'Internal server error.'),
    )
  })

  app.post('/api/auth/login', async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid login input.')
    }

    const input: LoginInput = parsed.data
    const rateLimitKey = `${request.ip}\0${input.username}`
    const allowance = services.loginRateLimiter.check(rateLimitKey)
    if (!allowance.allowed) {
      reply.header('Retry-After', Math.max(1, Math.ceil(allowance.retryAfterMs / 1_000)))
      return sendError(reply, 429, 'rate_limited', 'Too many login attempts.')
    }

    const userId = await services.auth.authenticate(
      input.username,
      input.password,
      input.totp,
    )
    if (userId === null) {
      services.loginRateLimiter.recordFailure(rateLimitKey)
      return sendError(reply, 401, 'invalid_credentials', 'Invalid credentials.')
    }

    const user = services.users.findById(userId)
    if (user === null) {
      request.log.error({ userId }, 'Authenticated user record disappeared')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }

    services.loginRateLimiter.reset(rateLimitKey)
    const session = services.authSessions.create(user.id)
    reply.header(
      'Set-Cookie',
      serializeAuthCookie(session.token, services.authSessionTtlMs),
    )
    return ok<{ user: User }>({ user })
  })

  app.post('/api/auth/logout', async (request, reply) => {
    if (!EmptyBodySchema.safeParse(request.body).success) {
      return sendError(reply, 400, 'validation_failed', 'Request body must be empty.')
    }
    const token = readAuthCookie(request.headers.cookie)
    if (token !== null) {
      services.authSessions.revoke(token)
    }
    reply.header('Set-Cookie', clearAuthCookie())
    return ok<Record<string, never>>({})
  })

  app.get('/api/auth/me', async (request, reply) => {
    const user = resolveAuthenticatedUser(request, services)
    return user === null
      ? sendError(reply, 401, 'unauthorized', 'Authentication required.')
      : ok<{ user: User }>({ user })
  })

  app.post('/api/ws-ticket', async (request, reply) => {
    if (!EmptyBodySchema.safeParse(request.body).success) {
      return sendError(reply, 400, 'validation_failed', 'Request body must be empty.')
    }
    const user = resolveAuthenticatedUser(request, services)
    if (user === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const ticket: WsTicket = services.tickets.issue(user.id)
    return ok<WsTicket>(ticket)
  })

  app.get('/api/sessions', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    return ok<readonly Session[]>(services.sessions.list())
  })

  app.post('/api/sessions', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const parsed = CreateSessionInputSchema.safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid session input.')
    }

    const input: CreateSessionInput =
      parsed.data.cwd === undefined
        ? {
            projectId: parsed.data.projectId,
            name: parsed.data.name,
            agent: parsed.data.agent,
          }
        : {
            projectId: parsed.data.projectId,
            name: parsed.data.name,
            agent: parsed.data.agent,
            cwd: parsed.data.cwd,
          }
    try {
      const session = await services.sessions.create(
        input.projectId,
        input.name,
        input.agent,
        input.cwd,
      )
      reply.code(201)
      return ok<Session>(session)
    } catch (error) {
      if (error instanceof SessionProjectNotFoundError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'Project was not found.',
          'projectId',
        )
      }
      if (error instanceof SessionDirectoryNotFoundError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'Directory was not found.',
          'cwd',
        )
      }
      request.log.error({ err: error }, 'Session creation failed')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }
  })

  app.delete('/api/sessions/:id', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const parsed = SessionParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid session id.', 'id')
    }
    try {
      if (!(await services.sessions.delete(parsed.data.id))) {
        return sendError(reply, 404, 'session_not_found', 'Session was not found.')
      }
      return ok<Record<string, never>>({})
    } catch (error) {
      request.log.error({ err: error }, 'Session deletion failed')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }
  })
}

function resolveAuthenticatedUser(
  request: FastifyRequest,
  services: Phase1RouteServices,
): User | null {
  const token = readAuthCookie(request.headers.cookie)
  if (token === null) {
    return null
  }
  const userId = services.authSessions.resolve(token)
  return userId === null ? null : services.users.findById(userId)
}

function ok<T>(data: T): ApiOk<T> {
  return { ok: true, data }
}

function sendError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 404 | 429 | 500,
  code: ErrorCode,
  message: string,
  field?: string,
): ApiErr {
  reply.code(statusCode)
  return {
    ok: false,
    error: field === undefined ? { code, message } : { code, message, field },
  }
}

function hasClientStatusCode(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return false
  }
  const statusCode = error.statusCode
  return typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
}

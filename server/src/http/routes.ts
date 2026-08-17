import type {
  ApiErr,
  ApiOk,
  AppConfig,
  CreateProjectInput,
  CreateSessionInput,
  ErrorCode,
  Layout,
  LayoutInput,
  LoginInput,
  Project,
  PushStatus,
  PushSubscriptionInput,
  Session,
  UpdateProjectInput,
  User,
  WsTicket,
} from '@termspace/contracts'
import {
  AGENT_KINDS,
  BINARY_SID_BYTES,
  DEFAULT_AGENT_COMMANDS,
  LAYOUT_MAX_SLOTS,
  LAYOUT_MODES,
  normalizeLayout,
} from '@termspace/contracts'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

import { clearAuthCookie, readAuthCookie, serializeAuthCookie } from '../auth/cookie.js'
import {
  AgentCommandSchema,
  parseAgentCommandOverrides,
} from '../projects/agent-commands.js'
import { PathInvalidError, PathOutsideRootError } from '../fs/contained-path.js'
import {
  ProjectCloneFailedError,
  ProjectConflictError,
  ProjectHasSessionsError,
  ProjectPathMissingError,
  ProjectPathNotCreatableError,
  ProjectPathOccupiedError,
} from '../projects/project-manager.js'
import {
  SessionCwdOutsideProjectError,
  SessionDirectoryNotFoundError,
  SessionProjectNotFoundError,
} from '../sessions/session-manager.js'
import {
  WorktreeConflictError,
  WorktreeCreateFailedError,
  WorktreeDirtyError,
  WorktreeInvalidRepositoryError,
} from '../git/worktree-manager.js'

const LoginInputSchema = z
  .object({
    username: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/),
    password: z.string().min(1).max(1_024),
    totp: z.string().regex(/^\d{6}$/),
  })
  .strict()

const SessionInputBaseSchema = z.object({
  projectId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  agent: z.enum(AGENT_KINDS),
})

const CreateSessionInputSchema = z.discriminatedUnion('worktree', [
  SessionInputBaseSchema.extend({
    worktree: z.literal(false).optional(),
    cwd: z.string().min(1).max(4_096).optional(),
  }).strict(),
  SessionInputBaseSchema.extend({
    worktree: z.literal(true),
    worktreeBranch: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !value.startsWith('-') && !value.includes('\0')),
  }).strict(),
])

const DeleteSessionQuerySchema = z
  .object({
    force: z.literal('true').optional(),
  })
  .strict()

/**
 * `repoUrl` reaches a `git clone` argv, so it is restricted to the transports we
 * actually clone over: https/ssh/git URLs, `user@host:path`, and an absolute
 * local path (this is a self-hosted box; a bare repo on the same disk is a real
 * case). Everything else is refused — above all `ext::`, which makes git run an
 * arbitrary command, and anything starting with a dash, which git reads as a flag.
 */
const RepoUrlSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine(
    (value) =>
      !value.includes('\0') &&
      (/^(https:\/\/|ssh:\/\/|git:\/\/)[^\s]+$/.test(value) ||
        /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:[^\s]+$/.test(value) ||
        /^\/[^\s\0]*$/.test(value)),
    'Must be an https, ssh, or git URL, user@host:path, or an absolute path',
  )

/**
 * Every agent kind is optional; an absent one means the project defers to the
 * server default. Declared once so create and update cannot drift apart.
 */
const AgentCommandOverridesInputSchema = z
  .object(Object.fromEntries(AGENT_KINDS.map((kind) => [kind, AgentCommandSchema.optional()])))
  .strict()

/**
 * Exactly what `PushSubscription.toJSON()` produces. The keys are opaque
 * base64url that only the push protocol reads, so they are bounded and checked
 * for shape rather than decoded here.
 */
const PushSubscriptionInputSchema = z.object({
  endpoint: z.url().max(2_048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
})

const UpdateProjectInputSchema = z.object({
  agentCommands: AgentCommandOverridesInputSchema.optional(),
})

const CreateProjectInputSchema = z
  .object({
    name: z.string().min(1).max(128),
    path: z.string().min(1).max(4_096),
    repoUrl: RepoUrlSchema.optional(),
    createDirectory: z.boolean().optional(),
    defaultBranch: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9._\/-]+$/)
      .refine((value) => !value.startsWith('-'), 'Must not start with a dash')
      .optional(),
    setupCommand: z.string().min(1).max(4_096).optional(),
    agentCommands: AgentCommandOverridesInputSchema.optional(),
  })
  .strict()
  .refine(
    (value) => value.repoUrl === undefined || value.createDirectory !== true,
    { message: 'A clone makes the directory itself', path: ['createDirectory'] },
  )

const SessionIdSchema = z.string().length(BINARY_SID_BYTES).regex(/^[A-Za-z0-9_-]+$/)

const LayoutInputSchema = z
  .object({
    mode: z.enum(LAYOUT_MODES),
    slots: z.array(SessionIdSchema.nullable()).max(LAYOUT_MAX_SLOTS),
    focusedSlot: z.number().int().min(0).max(LAYOUT_MAX_SLOTS - 1),
  })
  .strict()

const ProjectParamsSchema = z.object({ id: z.string().min(1).max(128) })

const SessionParamsSchema = z.object({ id: SessionIdSchema })
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
  create(input: CreateSessionInput): Promise<Session>
  delete(sessionId: string, options?: { readonly force?: boolean }): Promise<boolean>
  list(): readonly Session[]
}

interface ProjectOperations {
  readonly projectRoot: string
  projectRootWritable(): Promise<boolean>
  create(input: CreateProjectInput): Promise<Project>
  update(projectId: string, input: UpdateProjectInput): Project | null
  delete(projectId: string): boolean
  list(): readonly Project[]
}

interface PushOperations {
  /** Null when the server has no VAPID keys; the UI hides push entirely. */
  readonly publicKey: string | null
  subscribe(userId: string, subscription: PushSubscriptionInput): void
  unsubscribe(userId: string, endpoint: string): boolean
  count(userId: string): number
}

interface LayoutOperations {
  find(userId: string, knownSessionIds: ReadonlySet<string>): Layout
  save(userId: string, input: LayoutInput, updatedAt: number): Layout
}

interface Tickets {
  issue(userId: string): WsTicket
}

export interface Phase1RouteServices {
  readonly auth: Authenticator
  readonly authSessionTtlMs: number
  readonly authSessions: AuthSessions
  readonly layouts: LayoutOperations
  readonly loginRateLimiter: RateLimiter
  readonly projects: ProjectOperations
  readonly push: PushOperations
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

  app.get('/api/config', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    return ok<AppConfig>({
      projectRoot: services.projects.projectRoot,
      projectRootWritable: await services.projects.projectRootWritable(),
      defaultAgentCommands: DEFAULT_AGENT_COMMANDS,
      pushPublicKey: services.push.publicKey,
    })
  })

  app.get('/api/push', async (request, reply) => {
    const user = resolveAuthenticatedUser(request, services)
    if (user === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    return ok<PushStatus>({
      enabled: services.push.publicKey !== null,
      subscriptionCount: services.push.count(user.id),
    })
  })

  app.post('/api/push/subscriptions', async (request, reply) => {
    const user = resolveAuthenticatedUser(request, services)
    if (user === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    if (services.push.publicKey === null) {
      // A server misconfiguration, not a client mistake: the UI only offers
      // push when `GET /api/config` says it is available.
      return sendError(
        reply,
        500,
        'internal_error',
        'Push is not configured on this server.',
      )
    }
    const parsed = PushSubscriptionInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return sendError(
        reply,
        400,
        'validation_failed',
        'Invalid push subscription.',
        issue?.path[0] === undefined ? undefined : String(issue.path[0]),
      )
    }
    try {
      services.push.subscribe(user.id, parsed.data)
      reply.code(201)
      return ok<Record<string, never>>({})
    } catch (error) {
      request.log.error({ err: error }, 'Push subscription failed')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }
  })

  app.delete('/api/push/subscriptions', async (request, reply) => {
    const user = resolveAuthenticatedUser(request, services)
    if (user === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const parsed = z
      .object({ endpoint: z.url().max(2_048) })
      .safeParse(request.body)
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid endpoint.', 'endpoint')
    }
    // Idempotent on purpose: unsubscribing something already gone is the
    // outcome the caller wanted, and a browser can revoke permission without
    // telling us first.
    services.push.unsubscribe(user.id, parsed.data.endpoint)
    return ok<Record<string, never>>({})
  })

  app.get('/api/projects', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    return ok<readonly Project[]>(services.projects.list())
  })

  app.post('/api/projects', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const parsed = CreateProjectInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return sendError(
        reply,
        400,
        'validation_failed',
        'Invalid project input.',
        issue?.path[0] === undefined ? undefined : String(issue.path[0]),
      )
    }

    // `exactOptionalPropertyTypes` means an explicit `undefined` is not the same
    // as an absent key, and zod hands back explicit `undefined` for what it did
    // not see.
    const input: CreateProjectInput = {
      name: parsed.data.name,
      path: parsed.data.path,
      ...(parsed.data.repoUrl === undefined ? {} : { repoUrl: parsed.data.repoUrl }),
      ...(parsed.data.createDirectory === undefined
        ? {}
        : { createDirectory: parsed.data.createDirectory }),
      ...(parsed.data.defaultBranch === undefined
        ? {}
        : { defaultBranch: parsed.data.defaultBranch }),
      ...(parsed.data.setupCommand === undefined
        ? {}
        : { setupCommand: parsed.data.setupCommand }),
      ...(parsed.data.agentCommands === undefined
        ? {}
        : { agentCommands: parseAgentCommandOverrides(parsed.data.agentCommands) }),
    }

    try {
      const project = await services.projects.create(input)
      reply.code(201)
      return ok<Project>(project)
    } catch (error) {
      if (error instanceof PathInvalidError || error instanceof PathOutsideRootError) {
        return sendError(reply, 400, 'validation_failed', error.message, 'path')
      }
      if (error instanceof ProjectPathMissingError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'That directory was not found. Create it, or give a repo URL to clone into it.',
          'path',
        )
      }
      if (error instanceof ProjectPathNotCreatableError) {
        request.log.error({ err: error }, 'Project directory could not be created')
        return sendError(
          reply,
          400,
          'validation_failed',
          `Could not create that directory. Check that ${services.projects.projectRoot} exists and the server can write to it.`,
          'path',
        )
      }
      if (error instanceof ProjectPathOccupiedError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'That directory already exists, so there is nothing to clone into.',
          'path',
        )
      }
      if (error instanceof ProjectConflictError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'A project already uses that directory.',
          'path',
        )
      }
      if (error instanceof ProjectCloneFailedError) {
        request.log.error({ err: error }, 'Project clone failed')
        return sendError(
          reply,
          400,
          'validation_failed',
          'Could not clone that repository. Check the URL and the branch.',
          'repoUrl',
        )
      }
      request.log.error({ err: error }, 'Project creation failed')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }
  })

  /**
   * Only the launch overrides are editable. Path and slug are identity: changing
   * either would leave every existing session pointing at a directory its
   * project no longer claims.
   */
  app.patch('/api/projects/:id', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const params = ProjectParamsSchema.safeParse(request.params)
    if (!params.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid project id.', 'id')
    }
    const parsed = UpdateProjectInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return sendError(
        reply,
        400,
        'validation_failed',
        'Invalid project input.',
        issue?.path[0] === undefined ? undefined : String(issue.path[0]),
      )
    }
    const input: UpdateProjectInput =
      parsed.data.agentCommands === undefined
        ? {}
        : { agentCommands: parseAgentCommandOverrides(parsed.data.agentCommands) }
    try {
      const project = services.projects.update(params.data.id, input)
      if (project === null) {
        return sendError(reply, 404, 'project_not_found', 'Project was not found.')
      }
      return ok<Project>(project)
    } catch (error) {
      request.log.error({ err: error }, 'Project update failed')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }
  })

  app.delete('/api/projects/:id', async (request, reply) => {
    if (resolveAuthenticatedUser(request, services) === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const parsed = ProjectParamsSchema.safeParse(request.params)
    if (!parsed.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid project id.', 'id')
    }
    try {
      if (!services.projects.delete(parsed.data.id)) {
        return sendError(reply, 404, 'project_not_found', 'Project was not found.')
      }
      return ok<Record<string, never>>({})
    } catch (error) {
      if (error instanceof ProjectHasSessionsError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'Delete this project’s sessions first.',
          'id',
        )
      }
      request.log.error({ err: error }, 'Project deletion failed')
      return sendError(reply, 500, 'internal_error', 'Internal server error.')
    }
  })

  app.get('/api/layouts', async (request, reply) => {
    const user = resolveAuthenticatedUser(request, services)
    if (user === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    return ok<Layout>(services.layouts.find(user.id, liveSessionIds(services)))
  })

  app.put('/api/layouts', async (request, reply) => {
    const user = resolveAuthenticatedUser(request, services)
    if (user === null) {
      return sendError(reply, 401, 'unauthorized', 'Authentication required.')
    }
    const parsed = LayoutInputSchema.safeParse(request.body)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return sendError(
        reply,
        400,
        'validation_failed',
        'Invalid layout.',
        issue?.path[0] === undefined ? undefined : String(issue.path[0]),
      )
    }
    // A slot naming a session that has since been deleted is emptied rather
    // than refused: the client is describing what it wants on screen, and one
    // stale id is no reason to lose the rest of the arrangement.
    const layout = normalizeLayout(parsed.data, { knownSessionIds: liveSessionIds(services) })
    return ok<Layout>(services.layouts.save(user.id, layout, Date.now()))
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

    const data = parsed.data
    const input: CreateSessionInput =
      data.worktree === true
        ? {
            projectId: data.projectId,
            name: data.name,
            agent: data.agent,
            worktree: true,
            worktreeBranch: data.worktreeBranch,
          }
        : {
            projectId: data.projectId,
            name: data.name,
            agent: data.agent,
            ...(data.worktree === false ? { worktree: false as const } : {}),
            ...(data.cwd === undefined ? {} : { cwd: data.cwd }),
          }
    try {
      const session = await services.sessions.create(input)
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
      if (
        error instanceof SessionCwdOutsideProjectError ||
        error instanceof PathInvalidError ||
        error instanceof PathOutsideRootError
      ) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'Working directory must be inside the project.',
          'cwd',
        )
      }
      if (error instanceof WorktreeInvalidRepositoryError) {
        return sendError(
          reply,
          400,
          'validation_failed',
          'The project is not a git repository.',
          'worktree',
        )
      }
      if (error instanceof WorktreeConflictError) {
        return sendError(
          reply,
          409,
          'worktree_conflict',
          'That worktree branch or directory already exists.',
          'worktreeBranch',
        )
      }
      if (error instanceof WorktreeCreateFailedError) {
        request.log.error({ err: error }, 'Worktree creation failed')
        return sendError(reply, 500, 'internal_error', 'Could not create the worktree.')
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
    const query = DeleteSessionQuerySchema.safeParse(request.query)
    if (!query.success) {
      return sendError(reply, 400, 'validation_failed', 'Invalid delete options.', 'force')
    }
    try {
      const options = query.data.force === 'true' ? { force: true } : {}
      if (!(await services.sessions.delete(parsed.data.id, options))) {
        return sendError(reply, 404, 'session_not_found', 'Session was not found.')
      }
      return ok<Record<string, never>>({})
    } catch (error) {
      if (error instanceof WorktreeDirtyError) {
        return sendError(
          reply,
          409,
          'worktree_dirty',
          'The worktree has uncommitted changes. Force deletion to discard them.',
        )
      }
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

function liveSessionIds(services: Phase1RouteServices): ReadonlySet<string> {
  return new Set(services.sessions.list().map((session) => session.id))
}

function ok<T>(data: T): ApiOk<T> {
  return { ok: true, data }
}

function sendError(
  reply: FastifyReply,
  statusCode: 400 | 401 | 404 | 409 | 429 | 500,
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

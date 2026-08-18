import {
  AGENT_KINDS,
  CLIENT_ERROR_PREFIX,
  LAYOUT_MODES,
  OPERATIONAL_EVENT_KINDS,
  OPERATIONAL_EVENT_LEVELS,
  OPERATIONAL_HEALTH_STATES,
} from '@termspace/contracts'
import type {
  ApiResponse,
  AppConfig,
  CreateProjectInput,
  CreateSessionInput,
  DeleteSessionOptions,
  DiffResult,
  Favorites,
  HealthData,
  Layout,
  LayoutInput,
  LoginInput,
  OperationalStatus,
  Project,
  PushSubscriptionInput,
  Session,
  UpdateProjectInput,
  User,
  WsTicket,
} from '@termspace/contracts'
import { z } from 'zod'

import type { DataSource, Empty } from './types.ts'

/**
 * Minted by the client only, for failures where the server produced no valid
 * envelope at all. The server must never send these; its codes are the closed
 * union in `@termspace/contracts`.
 */
export const CLIENT_ERROR_CODES = {
  unreachable: `${CLIENT_ERROR_PREFIX}network_unreachable`,
  malformed: `${CLIENT_ERROR_PREFIX}malformed_response`,
} as const

const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  field: z.string().optional(),
})

function envelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: ApiErrorSchema }),
  ])
}

const SessionStateSchema = z.enum(['working', 'idle', 'needs-you', 'dead'])

export const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  repoUrl: z.string().nullable(),
  defaultBranch: z.string(),
  setupCommand: z.string().nullable(),
  /**
   * `partialRecord`, not `record`: in zod 4 a record keyed by an enum is
   * exhaustive and demands every key, so a project overriding nothing — the
   * normal case — failed validation and took the whole project list with it.
   */
  agentCommands: z.partialRecord(z.enum(AGENT_KINDS), z.array(z.string())),
  createdAt: z.number(),
})

export const SessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  agent: z.enum(['claude', 'codex', 'shell']),
  cwd: z.string(),
  worktreeBranch: z.string().nullable(),
  hasCwdConflict: z.boolean(),
  state: SessionStateSchema,
  title: z.string().nullable(),
  lastActivityAt: z.number(),
  createdAt: z.number(),
})

const DiffFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.enum([
    'added', 'modified', 'deleted', 'renamed', 'copied', 'untracked', 'conflicted',
  ]),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
})

export const DiffResultSchema = z.object({
  sessionId: z.string(),
  baseBranch: z.string(),
  files: z.array(DiffFileSchema),
  patch: z.string(),
  truncated: z.boolean(),
})

const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
  createdAt: z.number(),
})

const LayoutSchema = z.object({
  mode: z.enum(LAYOUT_MODES),
  slots: z.array(z.string().nullable()),
  focusedSlot: z.number(),
  updatedAt: z.number(),
})

const HealthSchema = z.object({ version: z.string() })
/** Exhaustive on purpose here — the server sends a command for every kind. */
export const AppConfigSchema = z.object({
  projectRoot: z.string(),
  projectRootWritable: z.boolean(),
  pushPublicKey: z.string().nullable(),
  defaultAgentCommands: z.record(z.enum(AGENT_KINDS), z.array(z.string())),
})
export const FavoritesSchema = z.object({
  projectIds: z.array(z.string()),
  sessionIds: z.array(z.string()),
})
export const OperationalStatusSchema = z.object({
  generatedAt: z.number(),
  gateway: z.object({
    health: z.enum(OPERATIONAL_HEALTH_STATES),
    version: z.string(),
    uptimeMs: z.number().nonnegative(),
  }),
  tmux: z.object({
    health: z.enum(OPERATIONAL_HEALTH_STATES),
    liveSessions: z.number().int().nonnegative().nullable(),
    persistedSessions: z.number().int().nonnegative(),
  }),
  storage: z.object({
    databaseBytes: z.number().nonnegative().nullable(),
    projectRoot: z.object({
      path: z.string(),
      totalBytes: z.number().nonnegative().nullable(),
      availableBytes: z.number().nonnegative().nullable(),
    }),
    backups: z.object({
      count: z.number().int().nonnegative().nullable(),
      latestAt: z.number().nullable(),
      latestBytes: z.number().nonnegative().nullable(),
    }),
  }),
  policy: z.object({
    sessionMemoryMaxBytes: z.number().positive(),
    idleSessionGraceMs: z.number().positive(),
    backupRetentionCount: z.number().int().positive(),
  }),
  eventsAvailable: z.boolean(),
  recentEvents: z.array(z.object({
    at: z.number(),
    kind: z.enum(OPERATIONAL_EVENT_KINDS),
    level: z.enum(OPERATIONAL_EVENT_LEVELS),
    summary: z.string(),
  })),
})
const UserEnvelopeSchema = z.object({ user: UserSchema })
const WsTicketSchema = z.object({ ticket: z.string(), expiresAt: z.number() })
const EmptySchema = z.object({}).strict()

const apiBase = process.env.NEXT_PUBLIC_TERMSPACE_API_BASE ?? ''

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  json?: unknown
  signal?: AbortSignal | undefined
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', json, signal } = options
  let body: unknown
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      credentials: 'include',
      headers:
        json === undefined
          ? { accept: 'application/json' }
          : { accept: 'application/json', 'content-type': 'application/json' },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      ...(signal ? { signal } : {}),
    })
    body = await response.json()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    return {
      ok: false,
      error: {
        code: CLIENT_ERROR_CODES.unreachable,
        message: 'Could not reach the Termspace server.',
      },
    }
  }

  const parsed = envelopeSchema(schema).safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: CLIENT_ERROR_CODES.malformed,
        message: `The server sent a response that does not match the contract for ${path}.`,
      },
    }
  }
  return parsed.data as ApiResponse<T>
}

export const httpSource: DataSource = {
  kind: 'http',
  health(signal?: AbortSignal): Promise<ApiResponse<HealthData>> {
    return request('/api/health', HealthSchema, { signal })
  },
  config(signal?: AbortSignal): Promise<ApiResponse<AppConfig>> {
    return request('/api/config', AppConfigSchema, { signal })
  },
  operations(signal?: AbortSignal): Promise<ApiResponse<OperationalStatus>> {
    return request('/api/operations', OperationalStatusSchema, { signal })
  },
  favorites(signal?: AbortSignal): Promise<ApiResponse<Favorites>> {
    return request('/api/favorites', FavoritesSchema, { signal })
  },
  saveFavorites(input: Favorites, signal?: AbortSignal): Promise<ApiResponse<Favorites>> {
    return request('/api/favorites', FavoritesSchema, { method: 'PUT', json: input, signal })
  },
  listProjects(signal?: AbortSignal): Promise<ApiResponse<Project[]>> {
    return request('/api/projects', z.array(ProjectSchema), { signal })
  },
  createProject(
    input: CreateProjectInput,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Project>> {
    return request('/api/projects', ProjectSchema, {
      method: 'POST',
      json: input,
      signal,
    })
  },
  updateProject(
    projectId: string,
    input: UpdateProjectInput,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Project>> {
    return request(`/api/projects/${encodeURIComponent(projectId)}`, ProjectSchema, {
      method: 'PATCH',
      json: input,
      signal,
    })
  },
  subscribeToPush(
    subscription: PushSubscriptionInput,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Empty>> {
    return request('/api/push/subscriptions', EmptySchema, {
      method: 'POST',
      json: subscription,
      signal,
    })
  },
  unsubscribeFromPush(endpoint: string, signal?: AbortSignal): Promise<ApiResponse<Empty>> {
    return request('/api/push/subscriptions', EmptySchema, {
      method: 'DELETE',
      json: { endpoint },
      signal,
    })
  },
  deleteProject(projectId: string, signal?: AbortSignal): Promise<ApiResponse<Empty>> {
    return request(`/api/projects/${encodeURIComponent(projectId)}`, EmptySchema, {
      method: 'DELETE',
      signal,
    })
  },
  listSessions(signal?: AbortSignal): Promise<ApiResponse<Session[]>> {
    return request('/api/sessions', z.array(SessionSchema), { signal })
  },
  layout(signal?: AbortSignal): Promise<ApiResponse<Layout>> {
    return request('/api/layouts', LayoutSchema, { signal })
  },
  saveLayout(input: LayoutInput, signal?: AbortSignal): Promise<ApiResponse<Layout>> {
    return request('/api/layouts', LayoutSchema, { method: 'PUT', json: input, signal })
  },
  login(input: LoginInput, signal?: AbortSignal): Promise<ApiResponse<{ user: User }>> {
    return request('/api/auth/login', UserEnvelopeSchema, {
      method: 'POST',
      json: input,
      signal,
    })
  },
  /** No body at all: the server requires these POSTs to be empty. */
  logout(signal?: AbortSignal): Promise<ApiResponse<Empty>> {
    return request('/api/auth/logout', EmptySchema, { method: 'POST', signal })
  },
  me(signal?: AbortSignal): Promise<ApiResponse<{ user: User }>> {
    return request('/api/auth/me', UserEnvelopeSchema, { signal })
  },
  wsTicket(signal?: AbortSignal): Promise<ApiResponse<WsTicket>> {
    return request('/api/ws-ticket', WsTicketSchema, { method: 'POST', signal })
  },
  createSession(
    input: CreateSessionInput,
    signal?: AbortSignal,
  ): Promise<ApiResponse<Session>> {
    return request('/api/sessions', SessionSchema, {
      method: 'POST',
      json: input,
      signal,
    })
  },
  sessionDiff(sessionId: string, signal?: AbortSignal): Promise<ApiResponse<DiffResult>> {
    return request(`/api/sessions/${encodeURIComponent(sessionId)}/diff`, DiffResultSchema, {
      signal,
    })
  },
  deleteSession(
    sessionId: string,
    options: DeleteSessionOptions = {},
    signal?: AbortSignal,
  ): Promise<ApiResponse<Empty>> {
    const force = options.force === true ? '?force=true' : ''
    return request(`/api/sessions/${encodeURIComponent(sessionId)}${force}`, EmptySchema, {
      method: 'DELETE',
      signal,
    })
  },
}

import { AGENT_KINDS, CLIENT_ERROR_PREFIX, LAYOUT_MODES } from '@termspace/contracts'
import type {
  ApiResponse,
  AppConfig,
  CreateProjectInput,
  CreateSessionInput,
  HealthData,
  Layout,
  LayoutInput,
  LoginInput,
  Project,
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

const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  path: z.string(),
  repoUrl: z.string().nullable(),
  defaultBranch: z.string(),
  setupCommand: z.string().nullable(),
  agentCommands: z.record(z.enum(AGENT_KINDS), z.array(z.string())),
  createdAt: z.number(),
})

const SessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  agent: z.enum(['claude', 'codex', 'shell']),
  cwd: z.string(),
  worktreeBranch: z.string().nullable(),
  state: SessionStateSchema,
  title: z.string().nullable(),
  lastActivityAt: z.number(),
  createdAt: z.number(),
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
const AppConfigSchema = z.object({
  projectRoot: z.string(),
  projectRootWritable: z.boolean(),
  defaultAgentCommands: z.record(z.enum(AGENT_KINDS), z.array(z.string())),
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
  deleteSession(sessionId: string, signal?: AbortSignal): Promise<ApiResponse<Empty>> {
    return request(`/api/sessions/${encodeURIComponent(sessionId)}`, EmptySchema, {
      method: 'DELETE',
      signal,
    })
  },
}

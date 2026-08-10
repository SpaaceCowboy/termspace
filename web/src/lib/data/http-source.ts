import { CLIENT_ERROR_PREFIX } from '@termspace/contracts'
import type { ApiResponse, HealthData, Project, Session } from '@termspace/contracts'
import { z } from 'zod'

import type { DataSource } from './types'

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

const HealthSchema = z.object({ version: z.string() })

const apiBase = process.env.NEXT_PUBLIC_TERMSPACE_API_BASE ?? ''

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  signal: AbortSignal | undefined,
): Promise<ApiResponse<T>> {
  let body: unknown
  try {
    const response = await fetch(`${apiBase}${path}`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
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
    return request('/api/health', HealthSchema, signal)
  },
  listProjects(signal?: AbortSignal): Promise<ApiResponse<Project[]>> {
    return request('/api/projects', z.array(ProjectSchema), signal)
  },
  listSessions(signal?: AbortSignal): Promise<ApiResponse<Session[]>> {
    return request('/api/sessions', z.array(SessionSchema), signal)
  },
}

import {
  healthDataFixture,
  projectFixtures,
  sessionFixtures,
  userFixture,
  type ApiResponse,
  type CreateSessionInput,
  type HealthData,
  type LoginInput,
  type Project,
  type Session,
  type User,
  type WsTicket,
} from '@termspace/contracts'

import type { DataSource, Empty } from './types.ts'

/** Any six digits log in except this one, so the error path stays reachable offline. */
const REJECTED_TOTP = '000000'

function ok<T>(data: T): Promise<ApiResponse<T>> {
  return Promise.resolve({ ok: true, data })
}

function fail<T>(code: string, message: string): Promise<ApiResponse<T>> {
  return Promise.resolve({ ok: false, error: { code, message } })
}

const liveSessions: Session[] = [...sessionFixtures]

export const fixtureSource: DataSource = {
  kind: 'fixtures',
  health(): Promise<ApiResponse<HealthData>> {
    return ok(healthDataFixture)
  },
  listProjects(): Promise<ApiResponse<Project[]>> {
    return ok([...projectFixtures])
  },
  listSessions(): Promise<ApiResponse<Session[]>> {
    return ok([...liveSessions])
  },
  login(input: LoginInput): Promise<ApiResponse<{ user: User }>> {
    if (input.totp === REJECTED_TOTP) {
      return fail('invalid_credentials', 'Invalid credentials.')
    }
    return ok({ user: { ...userFixture, username: input.username } })
  },
  logout(): Promise<ApiResponse<Empty>> {
    return ok({})
  },
  me(): Promise<ApiResponse<{ user: User }>> {
    return ok({ user: userFixture })
  },
  wsTicket(): Promise<ApiResponse<WsTicket>> {
    return ok({ ticket: 'x'.repeat(43), expiresAt: Date.now() + 10_000 })
  },
  createSession(input: CreateSessionInput): Promise<ApiResponse<Session>> {
    const created: Session = {
      id: `ses_fixture${String(liveSessions.length).padStart(5, '0')}`.slice(0, 16),
      projectId: input.projectId,
      name: input.name,
      agent: input.agent,
      cwd: input.cwd ?? '/srv/projects/portal-ui',
      worktreeBranch: null,
      state: 'idle',
      title: null,
      lastActivityAt: Date.now(),
      createdAt: Date.now(),
    }
    liveSessions.push(created)
    return ok(created)
  },
  deleteSession(sessionId: string): Promise<ApiResponse<Empty>> {
    const index = liveSessions.findIndex((session) => session.id === sessionId)
    if (index === -1) {
      return fail('session_not_found', 'Session was not found.')
    }
    liveSessions.splice(index, 1)
    return ok({})
  },
}

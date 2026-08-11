import {
  appConfigFixture,
  healthDataFixture,
  layoutFixture,
  normalizeLayout,
  projectFixtures,
  sessionFixtures,
  userFixture,
  type ApiResponse,
  type AppConfig,
  type CreateProjectInput,
  type CreateSessionInput,
  type HealthData,
  type Layout,
  type LayoutInput,
  type LoginInput,
  type Project,
  type Session,
  type UpdateProjectInput,
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
const liveProjects: Project[] = [...projectFixtures]
let liveLayout: Layout = layoutFixture

/** The same pruning the server does, so the fixture cannot show a ghost pane. */
function pruneLayout(layout: Layout): Layout {
  const knownSessionIds = new Set(liveSessions.map((session) => session.id))
  return { ...normalizeLayout(layout, { knownSessionIds }), updatedAt: layout.updatedAt }
}

export const fixtureSource: DataSource = {
  kind: 'fixtures',
  health(): Promise<ApiResponse<HealthData>> {
    return ok(healthDataFixture)
  },
  config(): Promise<ApiResponse<AppConfig>> {
    return ok(appConfigFixture)
  },
  listProjects(): Promise<ApiResponse<Project[]>> {
    return ok([...liveProjects])
  },
  createProject(input: CreateProjectInput): Promise<ApiResponse<Project>> {
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (liveProjects.some((project) => project.path === input.path)) {
      return fail('validation_failed', 'A project already uses that directory.')
    }
    if (input.repoUrl !== undefined && input.createDirectory === true) {
      return fail('validation_failed', 'A clone makes the directory itself.')
    }
    const created: Project = {
      id: `prj_fixture${String(liveProjects.length).padStart(4, '0')}`,
      slug: slug === '' ? 'project' : slug,
      name: input.name,
      path: input.path,
      repoUrl: input.repoUrl ?? null,
      defaultBranch: input.defaultBranch ?? 'main',
      setupCommand: input.setupCommand ?? null,
      agentCommands: input.agentCommands ?? {},
      createdAt: Date.now(),
    }
    liveProjects.push(created)
    return ok(created)
  },
  updateProject(
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ApiResponse<Project>> {
    const index = liveProjects.findIndex((entry) => entry.id === projectId)
    const project = liveProjects[index]
    if (project === undefined) {
      return fail('project_not_found', 'Project was not found.')
    }
    const updated: Project = {
      ...project,
      ...(input.agentCommands === undefined ? {} : { agentCommands: input.agentCommands }),
    }
    liveProjects[index] = updated
    return ok(updated)
  },
  deleteProject(projectId: string): Promise<ApiResponse<Empty>> {
    const index = liveProjects.findIndex((project) => project.id === projectId)
    if (index === -1) {
      return fail('project_not_found', 'Project was not found.')
    }
    if (liveSessions.some((session) => session.projectId === projectId)) {
      return fail('validation_failed', 'Delete this project’s sessions first.')
    }
    liveProjects.splice(index, 1)
    return ok({})
  },
  listSessions(): Promise<ApiResponse<Session[]>> {
    return ok([...liveSessions])
  },
  layout(): Promise<ApiResponse<Layout>> {
    liveLayout = pruneLayout(liveLayout)
    return ok(liveLayout)
  },
  saveLayout(input: LayoutInput): Promise<ApiResponse<Layout>> {
    liveLayout = pruneLayout({ ...input, updatedAt: Date.now() })
    return ok(liveLayout)
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

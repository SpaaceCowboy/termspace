import type { AgentKind, Project, Session } from './core.js'
import type { ApiErr, ApiError, ApiOk, HealthData } from './http.js'
import { BINARY_SID_BYTES } from './transport.js'
import type {
  ClientFrame,
  ClientFrameKind,
  ServerFrame,
  ServerFrameKind,
  SessionState,
  VisibilityLevel,
} from './transport.js'

const FIXED_NOW = 1_767_225_600_000

export const projectFixture: Project = {
  id: 'prj_portalui0001',
  slug: 'portal-ui',
  name: 'Portal UI',
  path: '/srv/projects/portal-ui',
  repoUrl: 'git@github.com:example/portal-ui.git',
  defaultBranch: 'main',
  setupCommand: 'pnpm install',
  createdAt: FIXED_NOW - 86_400_000,
}

export const projectFixtures: readonly Project[] = [
  projectFixture,
  {
    id: 'prj_apirefac0002',
    slug: 'api-refactor',
    name: 'API Refactor',
    path: '/srv/projects/api-refactor',
    repoUrl: null,
    defaultBranch: 'main',
    setupCommand: null,
    createdAt: FIXED_NOW - 172_800_000,
  },
]

export const sessionFixture: Session = {
  id: 'ses_portalui0001',
  projectId: projectFixture.id,
  name: 'portal-ui',
  agent: 'claude',
  cwd: '/srv/projects/portal-ui',
  worktreeBranch: null,
  state: 'working',
  title: 'refactoring the grid layout',
  lastActivityAt: FIXED_NOW - 1_000,
  createdAt: FIXED_NOW - 3_600_000,
}

export const sessionFixtures: readonly Session[] = [
  sessionFixture,
  {
    id: 'ses_apirefac0002',
    projectId: 'prj_apirefac0002',
    name: 'api-refactor',
    agent: 'codex',
    cwd: '/srv/projects/api-refactor',
    worktreeBranch: 'ts/api-refactor',
    state: 'needs-you',
    title: 'waiting on a permission prompt',
    lastActivityAt: FIXED_NOW - 12_000,
    createdAt: FIXED_NOW - 7_200_000,
  },
  {
    id: 'ses_scratch00003',
    projectId: projectFixture.id,
    name: 'scratch',
    agent: 'shell',
    cwd: '/srv/projects/portal-ui',
    worktreeBranch: null,
    state: 'idle',
    title: null,
    lastActivityAt: FIXED_NOW - 600_000,
    createdAt: FIXED_NOW - 600_000,
  },
]

export const agentKindFixtures: Readonly<Record<AgentKind, AgentKind>> = {
  claude: 'claude',
  codex: 'codex',
  shell: 'shell',
}

export const sessionStateFixtures: Readonly<Record<SessionState, SessionState>> = {
  working: 'working',
  idle: 'idle',
  'needs-you': 'needs-you',
  dead: 'dead',
}

export const visibilityLevelFixtures: Readonly<Record<VisibilityLevel, VisibilityLevel>> = {
  focused: 'focused',
  visible: 'visible',
  hidden: 'hidden',
}

export const clientFrameFixtures: Readonly<Record<ClientFrameKind, ClientFrame>> = {
  sub: { t: 'sub', sid: sessionFixture.id },
  unsub: { t: 'unsub', sid: sessionFixture.id },
  in: { t: 'in', sid: sessionFixture.id, data: 'ls -la\r' },
  resize: { t: 'resize', sid: sessionFixture.id, cols: 200, rows: 50 },
  vis: { t: 'vis', sid: sessionFixture.id, level: 'focused' },
  ping: { t: 'ping' },
}

export const serverFrameFixtures: Readonly<Record<ServerFrameKind, ServerFrame>> = {
  restore: {
    t: 'restore',
    sid: sessionFixture.id,
    data: '\u001b[2J\u001b[H$ claude\r\n\u001b[32m\u2713\u001b[0m ready\r\n$ ',
  },
  status: { t: 'status', sid: sessionFixture.id, state: 'working', since: FIXED_NOW - 1_000 },
  title: { t: 'title', sid: sessionFixture.id, title: 'refactoring the grid layout' },
  exit: { t: 'exit', sid: sessionFixture.id, code: 0 },
  truncated: { t: 'truncated', sid: sessionFixture.id },
  error: {
    t: 'error',
    sid: sessionFixture.id,
    code: 'session_not_found',
    message: 'That session is no longer running.',
  },
  pong: { t: 'pong' },
}

export const healthDataFixture: HealthData = { version: '0.0.0' }

export const apiErrorFixture: ApiError = {
  code: 'session_not_found',
  message: 'That session is no longer running.',
}

export const apiOkFixture: ApiOk<HealthData> = { ok: true, data: healthDataFixture }

export const apiErrFixture: ApiErr = { ok: false, error: apiErrorFixture }

export function binaryOutputFixture(sid: string = sessionFixture.id): Uint8Array {
  if (sid.length !== BINARY_SID_BYTES) {
    throw new Error(`session id must be exactly ${BINARY_SID_BYTES} ASCII bytes, got "${sid}"`)
  }
  const header = new TextEncoder().encode(sid)
  const body = new TextEncoder().encode('total 4\r\ndrwxr-xr-x 3 app app 4096 web\r\n')
  const frame = new Uint8Array(header.length + body.length)
  frame.set(header, 0)
  frame.set(body, header.length)
  return frame
}

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type {
  CreateProjectInput,
  CreateSessionInput,
  Layout,
  LayoutInput,
  Project,
  Session,
  UpdateProjectInput,
  User,
  WsTicket,
} from '@termspace/contracts'
import {
  DEFAULT_AGENT_COMMANDS,
  EMPTY_LAYOUT,
  LAYOUT_MAX_SLOTS,
  layoutFixture,
  projectFixture,
  projectFixtures,
  sessionFixture,
  userFixture,
} from '@termspace/contracts'
import Fastify, { type FastifyInstance } from 'fastify'

import {
  ProjectCloneFailedError,
  ProjectConflictError,
  ProjectHasSessionsError,
  ProjectPathMissingError,
  ProjectPathNotCreatableError,
  ProjectPathOccupiedError,
} from '../projects/project-manager.js'
import { SessionProjectNotFoundError } from '../sessions/session-manager.js'
import { WorktreeDirtyError } from '../git/worktree-manager.js'
import { registerPhase1Routes, type Phase1RouteServices } from './routes.js'

const AUTH_TOKEN = 'a'.repeat(43)
const SESSION_COOKIE = `termspace_session=${AUTH_TOKEN}`

function requireHeader(value: string | string[] | undefined): string {
  if (typeof value !== 'string') {
    throw new Error('Expected a single response header value')
  }
  return value
}

class FakeAuth {
  result: string | null = userFixture.id
  readonly attempts: { username: string; password: string; totp: string }[] = []

  async authenticate(username: string, password: string, totp: string): Promise<string | null> {
    this.attempts.push({ username, password, totp })
    return this.result
  }
}

class FakeAuthSessions {
  resolvedUserId: string | null = userFixture.id
  readonly createdFor: string[] = []
  readonly revoked: string[] = []

  create(userId: string): { token: string } {
    this.createdFor.push(userId)
    return { token: AUTH_TOKEN }
  }

  resolve(): string | null {
    return this.resolvedUserId
  }

  revoke(token: string): void {
    this.revoked.push(token)
  }
}

class FakeRateLimiter {
  blocked = false
  readonly failures: string[] = []
  readonly resets: string[] = []

  check(): { allowed: true } | { allowed: false; retryAfterMs: number } {
    return this.blocked
      ? { allowed: false, retryAfterMs: 1_500 }
      : { allowed: true }
  }

  recordFailure(key: string): void {
    this.failures.push(key)
  }

  reset(key: string): void {
    this.resets.push(key)
  }
}

class FakeSessions {
  createdInput: CreateSessionInput | undefined
  createError: Error | undefined
  deleteResult = true
  deleteError: Error | undefined
  readonly deleted: string[] = []
  readonly deleteOptions: ({ readonly force?: boolean } | undefined)[] = []

  async create(input: CreateSessionInput): Promise<Session> {
    this.createdInput = input
    if (this.createError !== undefined) {
      throw this.createError
    }
    return sessionFixture
  }

  list(): readonly Session[] {
    return [sessionFixture]
  }

  async delete(sessionId: string, options?: { readonly force?: boolean }): Promise<boolean> {
    this.deleted.push(sessionId)
    this.deleteOptions.push(options)
    if (this.deleteError !== undefined) {
      throw this.deleteError
    }
    return this.deleteResult
  }
}

class FakeProjects {
  readonly projectRoot = '/srv/projects'
  rootWritable = true
  createdInput: CreateProjectInput | undefined
  updatedInput: UpdateProjectInput | undefined
  createError: Error | undefined
  deleteError: Error | undefined
  deleteResult = true
  readonly deleted: string[] = []

  async projectRootWritable(): Promise<boolean> {
    return this.rootWritable
  }

  async create(input: CreateProjectInput): Promise<Project> {
    this.createdInput = input
    if (this.createError !== undefined) {
      throw this.createError
    }
    return projectFixture
  }

  list(): readonly Project[] {
    return projectFixtures
  }

  update(projectId: string, input: UpdateProjectInput): Project | null {
    this.updatedInput = input
    if (projectId !== projectFixture.id) {
      return null
    }
    return { ...projectFixture, ...input }
  }

  /** A method, not an assignment: assigning would narrow the field to `undefined`. */
  forget(): void {
    this.createdInput = undefined
    this.updatedInput = undefined
  }

  delete(projectId: string): boolean {
    this.deleted.push(projectId)
    if (this.deleteError !== undefined) {
      throw this.deleteError
    }
    return this.deleteResult
  }
}

/** Stores what it is given, so the route's own normalization is what is tested. */
class FakeLayouts {
  readonly stored = new Map<string, Layout>()
  readonly readFor: string[] = []

  find(userId: string): Layout {
    this.readFor.push(userId)
    return this.stored.get(userId) ?? EMPTY_LAYOUT
  }

  save(userId: string, input: LayoutInput, updatedAt: number): Layout {
    const layout: Layout = { ...input, updatedAt }
    this.stored.set(userId, layout)
    return layout
  }
}

describe('Phase 1 HTTP routes', () => {
  let app: FastifyInstance
  let auth: FakeAuth
  let authSessions: FakeAuthSessions
  let layouts: FakeLayouts
  let limiter: FakeRateLimiter
  let projects: FakeProjects
  let sessions: FakeSessions
  let user: User | null
  let issuedTicket: WsTicket
  let pushSubscriptions: { userId: string; endpoint: string }[]

  beforeEach(() => {
    pushSubscriptions = []
    app = Fastify()
    auth = new FakeAuth()
    authSessions = new FakeAuthSessions()
    layouts = new FakeLayouts()
    limiter = new FakeRateLimiter()
    projects = new FakeProjects()
    sessions = new FakeSessions()
    user = userFixture
    issuedTicket = { ticket: 'b'.repeat(43), expiresAt: 10_000 }
    const services: Phase1RouteServices = {
      auth,
      authSessionTtlMs: 60_000,
      authSessions,
      layouts,
      loginRateLimiter: limiter,
      projects,
      push: {
        publicKey: 'BFakeVapidPublicKey',
        subscribe: (userId, subscription) => {
          pushSubscriptions.push({ userId, endpoint: subscription.endpoint })
        },
        unsubscribe: (_userId, endpoint) => {
          const index = pushSubscriptions.findIndex((entry) => entry.endpoint === endpoint)
          if (index === -1) {
            return false
          }
          pushSubscriptions.splice(index, 1)
          return true
        },
        count: () => pushSubscriptions.length,
      },
      sessions,
      tickets: { issue: () => issuedTicket },
      users: { findById: () => user },
    }
    registerPhase1Routes(app, services)
  })

  afterEach(async () => {
    await app.close()
  })

  it('logs in with validated credentials and sets the hardened cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'operator', password: 'secret', totp: '123456' },
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true, data: { user: userFixture } })
    const setCookie = requireHeader(response.headers['set-cookie'])
    assert.match(
      setCookie,
      /^termspace_session=a{43}; Path=\/; Max-Age=60; HttpOnly; Secure; SameSite=Strict$/,
    )
    assert.deepEqual(authSessions.createdFor, [userFixture.id])
    assert.equal(limiter.resets.length, 1)
  })

  it('rejects invalid login input before authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'operator', password: 'secret', totp: '123' },
    })

    assert.equal(response.statusCode, 400)
    assert.equal(response.json().error.code, 'validation_failed')
    assert.deepEqual(auth.attempts, [])
  })

  it('records invalid credentials and enforces rate limiting', async () => {
    auth.result = null
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'operator', password: 'wrong', totp: '123456' },
    })
    assert.equal(invalid.statusCode, 401)
    assert.equal(invalid.json().error.code, 'invalid_credentials')
    assert.equal(limiter.failures.length, 1)

    limiter.blocked = true
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'operator', password: 'wrong', totp: '123456' },
    })
    assert.equal(limited.statusCode, 429)
    assert.equal(limited.headers['retry-after'], '2')
    assert.equal(limited.json().error.code, 'rate_limited')
    assert.equal(auth.attempts.length, 1)
  })

  it('returns the current user, issues a ticket, and logs out', async () => {
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.deepEqual(me.json(), { ok: true, data: { user: userFixture } })

    const ticket = await app.inject({
      method: 'POST',
      url: '/api/ws-ticket',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.deepEqual(ticket.json(), { ok: true, data: issuedTicket })

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.deepEqual(logout.json(), { ok: true, data: {} })
    assert.deepEqual(authSessions.revoked, [AUTH_TOKEN])
    const clearedCookie = requireHeader(logout.headers['set-cookie'])
    assert.match(clearedCookie, /Max-Age=0/)
  })

  it('rejects protected routes without a valid auth session', async () => {
    authSessions.resolvedUserId = null
    for (const request of [
      { method: 'GET' as const, url: '/api/auth/me' },
      { method: 'POST' as const, url: '/api/ws-ticket' },
      { method: 'GET' as const, url: '/api/sessions' },
    ]) {
      const response = await app.inject({
        ...request,
        headers: { cookie: SESSION_COOKIE },
      })
      assert.equal(response.statusCode, 401)
      assert.equal(response.json().error.code, 'unauthorized')
    }
  })

  it('lists, creates, and deletes sessions through the contract envelope', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/sessions',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.deepEqual(list.json(), { ok: true, data: [sessionFixture] })

    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: SESSION_COOKIE },
      payload: {
        projectId: 'project-1',
        name: 'Terminal',
        agent: 'shell',
        cwd: '/tmp',
      },
    })
    assert.equal(created.statusCode, 201)
    assert.deepEqual(created.json(), { ok: true, data: sessionFixture })
    assert.deepEqual(sessions.createdInput, {
      projectId: 'project-1',
      name: 'Terminal',
      agent: 'shell',
      cwd: '/tmp',
    })

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionFixture.id}`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.deepEqual(deleted.json(), { ok: true, data: {} })
    assert.deepEqual(sessions.deleted, [sessionFixture.id])
  })

  it('maps session validation and missing records to contract errors', async () => {
    sessions.createError = new SessionProjectNotFoundError('missing')
    const create = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: SESSION_COOKIE },
      payload: { projectId: 'missing', name: 'Terminal', agent: 'shell' },
    })
    assert.equal(create.statusCode, 400)
    assert.deepEqual(create.json().error, {
      code: 'validation_failed',
      message: 'Project was not found.',
      field: 'projectId',
    })

    sessions.deleteResult = false
    const missing = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionFixture.id}`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(missing.statusCode, 404)
    assert.equal(missing.json().error.code, 'session_not_found')
  })

  it('accepts a worktree create and rejects incoherent worktree inputs', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: SESSION_COOKIE },
      payload: {
        projectId: 'project-1',
        name: 'Parallel',
        agent: 'codex',
        worktree: true,
        worktreeBranch: 'ts/parallel',
      },
    })
    assert.equal(created.statusCode, 201)
    assert.deepEqual(sessions.createdInput, {
      projectId: 'project-1',
      name: 'Parallel',
      agent: 'codex',
      worktree: true,
      worktreeBranch: 'ts/parallel',
    })

    for (const payload of [
      { projectId: 'project-1', name: 'x', agent: 'codex', worktree: true },
      {
        projectId: 'project-1', name: 'x', agent: 'codex', worktree: true,
        worktreeBranch: 'ts/x', cwd: '/tmp',
      },
      { projectId: 'project-1', name: 'x', agent: 'codex', worktreeBranch: 'ts/x' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sessions',
        headers: { cookie: SESSION_COOKIE },
        payload,
      })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
    }
  })

  it('requires explicit force to delete a dirty worktree', async () => {
    sessions.deleteError = new WorktreeDirtyError('dirty')
    const refused = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionFixture.id}`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(refused.statusCode, 409)
    assert.equal(refused.json().error.code, 'worktree_dirty')

    sessions.deleteError = undefined
    const forced = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionFixture.id}?force=true`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(forced.statusCode, 200)
    assert.deepEqual(sessions.deleteOptions.at(-1), { force: true })

    const invalid = await app.inject({
      method: 'DELETE',
      url: `/api/sessions/${sessionFixture.id}?force=false`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(invalid.statusCode, 400)
  })

  it('rejects extra fields and malformed JSON at the HTTP boundary', async () => {
    const extra = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { cookie: SESSION_COOKIE },
      payload: { projectId: 'project-1', name: 'Terminal', agent: 'shell', extra: true },
    })
    assert.equal(extra.statusCode, 400)
    assert.equal(extra.json().error.code, 'validation_failed')

    const malformed = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    })
    assert.equal(malformed.statusCode, 400)
    assert.deepEqual(malformed.json(), {
      ok: false,
      error: { code: 'validation_failed', message: 'Invalid request.' },
    })
  })

  it('lists, creates, and deletes projects through the contract envelope', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(listed.statusCode, 200)
    assert.deepEqual(listed.json(), { ok: true, data: projectFixtures })

    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: SESSION_COOKIE },
      payload: { name: 'Portal UI', path: '/srv/projects/portal-ui' },
    })
    assert.equal(created.statusCode, 201)
    assert.deepEqual(created.json(), { ok: true, data: projectFixture })
    // An absent optional must stay absent, not arrive as an explicit undefined.
    assert.deepEqual(projects.createdInput, {
      name: 'Portal UI',
      path: '/srv/projects/portal-ui',
    })

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectFixture.id}`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(deleted.statusCode, 200)
    assert.deepEqual(projects.deleted, [projectFixture.id])
  })

  it('passes the optional project fields through when they are present', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: SESSION_COOKIE },
      payload: {
        name: 'Portal UI',
        path: '/srv/projects/portal-ui',
        repoUrl: 'https://github.com/example/portal-ui.git',
        defaultBranch: 'develop',
        setupCommand: 'pnpm install',
      },
    })
    assert.equal(response.statusCode, 201)
    assert.deepEqual(projects.createdInput, {
      name: 'Portal UI',
      path: '/srv/projects/portal-ui',
      repoUrl: 'https://github.com/example/portal-ui.git',
      defaultBranch: 'develop',
      setupCommand: 'pnpm install',
    })
  })

  it('refuses repo URLs and branches that would reach a git argv', async () => {
    for (const repoUrl of [
      'ext::sh -c whoami',
      'file:///etc/passwd',
      '--upload-pack=touch /tmp/pwned',
      '-u./payload',
      'relative/path.git',
      'https://example.com/a b.git',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: SESSION_COOKIE },
        payload: { name: 'Evil', path: '/srv/projects/evil', repoUrl },
      })
      assert.equal(response.statusCode, 400, `accepted repoUrl ${repoUrl}`)
      assert.equal(response.json().error.field, 'repoUrl')
    }

    const branch = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: SESSION_COOKIE },
      payload: {
        name: 'Evil',
        path: '/srv/projects/evil',
        repoUrl: 'https://github.com/example/x.git',
        defaultBranch: '--upload-pack=id',
      },
    })
    assert.equal(branch.statusCode, 400)
    assert.equal(branch.json().error.field, 'defaultBranch')
    assert.equal(projects.createdInput, undefined)
  })

  it('accepts the transports we do clone over, including a local bare repo', async () => {
    for (const repoUrl of [
      'https://github.com/example/x.git',
      'ssh://git@github.com/example/x.git',
      'git://github.com/example/x.git',
      'git@github.com:example/x.git',
      '/srv/repos/x.git',
    ]) {
      projects.forget()
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: SESSION_COOKIE },
        payload: { name: 'Fine', path: '/srv/projects/fine', repoUrl },
      })
      assert.equal(response.statusCode, 201, `refused repoUrl ${repoUrl}`)
      assert.equal(projects.createdInput?.repoUrl, repoUrl)
    }
  })

  it('maps project failures to contract errors with the offending field', async () => {
    const cases: [Error, string, string][] = [
      [new ProjectPathMissingError('missing'), 'validation_failed', 'path'],
      [new ProjectPathOccupiedError('occupied'), 'validation_failed', 'path'],
      [new ProjectConflictError('conflict'), 'validation_failed', 'path'],
      [new ProjectCloneFailedError('clone'), 'validation_failed', 'repoUrl'],
      [new ProjectPathNotCreatableError('denied'), 'validation_failed', 'path'],
    ]
    for (const [error, code, field] of cases) {
      projects.createError = error
      const response = await app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: SESSION_COOKIE },
        payload: { name: 'Portal UI', path: '/srv/projects/portal-ui' },
      })
      assert.equal(response.statusCode, 400, error.constructor.name)
      assert.equal(response.json().error.code, code)
      assert.equal(response.json().error.field, field)
    }

    projects.createError = undefined
    projects.deleteResult = false
    const missing = await app.inject({
      method: 'DELETE',
      url: '/api/projects/prj_missing',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(missing.statusCode, 404)
    assert.equal(missing.json().error.code, 'project_not_found')

    projects.deleteError = new ProjectHasSessionsError('busy')
    const busy = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectFixture.id}`,
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(busy.statusCode, 400)
    assert.equal(busy.json().error.code, 'validation_failed')
  })

  it('updates a project\'s agent commands and rejects a bad one', async () => {
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectFixture.id}`,
      headers: { cookie: SESSION_COOKIE },
      payload: { agentCommands: { claude: ['claude', '--model', 'opus'] } },
    })
    assert.equal(updated.statusCode, 200)
    assert.deepEqual(projects.updatedInput, {
      agentCommands: { claude: ['claude', '--model', 'opus'] },
    })

    projects.forget()
    const missing = await app.inject({
      method: 'PATCH',
      url: '/api/projects/prj_missing',
      headers: { cookie: SESSION_COOKIE },
      payload: { agentCommands: {} },
    })
    assert.equal(missing.statusCode, 404)
    assert.equal(missing.json().error.code, 'project_not_found')

    // A NUL would let the stored command and the executed one differ, and an
    // unknown kind would otherwise be silently dropped.
    for (const agentCommands of [{ claude: ['a\0b'] }, { gemini: ['gemini'] }, { claude: [''] }]) {
      projects.forget()
      const rejected = await app.inject({
        method: 'PATCH',
        url: `/api/projects/${projectFixture.id}`,
        headers: { cookie: SESSION_COOKIE },
        payload: { agentCommands },
      })
      assert.equal(rejected.statusCode, 400, JSON.stringify(agentCommands))
      assert.equal(rejected.json().error.code, 'validation_failed')
      assert.equal(projects.updatedInput, undefined, 'nothing may be written')
    }
  })

  it('requires authentication to update a project', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectFixture.id}`,
      payload: { agentCommands: {} },
    })
    assert.equal(response.statusCode, 401)
  })

  it('passes createDirectory through and refuses it alongside a repo URL', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: SESSION_COOKIE },
      payload: { name: 'Portal UI', path: '/srv/projects/portal-ui', createDirectory: true },
    })
    assert.equal(created.statusCode, 201)
    assert.equal(projects.createdInput?.createDirectory, true)

    projects.forget()
    const contradictory = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: SESSION_COOKIE },
      payload: {
        name: 'Portal UI',
        path: '/srv/projects/portal-ui',
        repoUrl: 'https://github.com/example/portal-ui.git',
        createDirectory: true,
      },
    })
    assert.equal(contradictory.statusCode, 400)
    assert.equal(contradictory.json().error.code, 'validation_failed')
    assert.equal(
      projects.createdInput,
      undefined,
      'a clone that also asks for a directory never reaches the manager',
    )
  })

  it('reports whether the server can actually write to the project root', async () => {
    const writable = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.deepEqual(writable.json(), {
      ok: true,
      data: {
        projectRoot: '/srv/projects',
        projectRootWritable: true,
        defaultAgentCommands: DEFAULT_AGENT_COMMANDS,
        pushPublicKey: 'BFakeVapidPublicKey',
      },
    })

    projects.rootWritable = false
    const readOnly = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { cookie: SESSION_COOKIE },
    })
    assert.equal(readOnly.json().data.projectRootWritable, false)
  })

  it('returns the stored layout for the caller, not for anyone else', async () => {
    layouts.stored.set(userFixture.id, layoutFixture)
    const response = await app.inject({
      method: 'GET',
      url: '/api/layouts',
      headers: { cookie: SESSION_COOKIE },
    })

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true, data: layoutFixture })
    assert.deepEqual(layouts.readFor, [userFixture.id])
  })

  it('saves a layout, stamping the time itself and echoing it back', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/layouts',
      headers: { cookie: SESSION_COOKIE },
      payload: { mode: 'split', slots: [sessionFixture.id], focusedSlot: 0 },
    })

    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.equal(body.data.mode, 'split')
    assert.equal(body.data.slots.length, LAYOUT_MAX_SLOTS)
    assert.ok(body.data.updatedAt > 0, 'the server stamps updatedAt')
  })

  it('empties a slot naming a session that no longer exists, keeping the rest', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/layouts',
      headers: { cookie: SESSION_COOKIE },
      payload: {
        mode: 'grid',
        slots: ['ses_deleted00001', sessionFixture.id],
        focusedSlot: 0,
      },
    })

    assert.equal(response.statusCode, 200)
    const saved = response.json().data
    assert.deepEqual(saved.slots.slice(0, 2), [null, sessionFixture.id])
    // Focus followed the surviving session rather than sitting on a dead slot.
    assert.equal(saved.focusedSlot, 1)
  })

  it('refuses a malformed layout instead of storing it', async () => {
    for (const payload of [
      { mode: 'mosaic', slots: [], focusedSlot: 0 },
      { mode: 'grid', slots: ['too-short'], focusedSlot: 0 },
      { mode: 'grid', slots: [], focusedSlot: -1 },
      { mode: 'grid', slots: new Array(LAYOUT_MAX_SLOTS + 1).fill(null), focusedSlot: 0 },
      { mode: 'grid', slots: [], focusedSlot: 0, extra: true },
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/layouts',
        headers: { cookie: SESSION_COOKIE },
        payload,
      })
      assert.equal(response.statusCode, 400, JSON.stringify(payload))
      assert.equal(response.json().error.code, 'validation_failed')
    }
    assert.equal(layouts.stored.size, 0)
  })

  it('requires authentication for every project and layout route', async () => {
    user = null
    for (const [method, url] of [
      ['GET', '/api/config'],
      ['GET', '/api/projects'],
      ['POST', '/api/projects'],
      ['DELETE', `/api/projects/${projectFixture.id}`],
      ['GET', '/api/layouts'],
      ['PUT', '/api/layouts'],
    ] as const) {
      const response = await app.inject({ method, url, headers: { cookie: SESSION_COOKIE } })
      assert.equal(response.statusCode, 401, `${method} ${url}`)
      assert.equal(response.json().error.code, 'unauthorized')
    }
    assert.equal(projects.createdInput, undefined)
    assert.deepEqual(projects.deleted, [])
    assert.equal(layouts.stored.size, 0)
  })
})

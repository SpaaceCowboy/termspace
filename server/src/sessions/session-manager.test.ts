import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { diffResultFixture, sessionFixture } from '@termspace/contracts'
import type { AgentCommand, DiffResult, Session } from '@termspace/contracts'

import type { SessionProject } from './session-repository.js'
import { SessionManager, SessionProjectNotFoundError } from './session-manager.js'
import { WorktreeDirtyError } from '../git/worktree-manager.js'

const SID = 'ses_portalui0001'

class FakeRepository {
  readonly sessions: Session[] = []
  failInsert = false
  project: SessionProject | null = {
    id: 'project-1',
    path: '/srv/project',
    defaultBranch: 'main',
    agentCommands: {},
  }

  findProject(): SessionProject | null {
    return this.project
  }

  /** A method, not an assignment: assigning would narrow the field. */
  setProject(project: SessionProject): void {
    this.project = project
  }

  insert(session: Session): void {
    if (this.failInsert) {
      throw new Error('insert failed')
    }
    this.sessions.push(session)
  }

  list(): readonly Session[] {
    return this.sessions
  }

  find(sessionId: string): Session | null {
    return this.sessions.find(({ id }) => id === sessionId) ?? null
  }

  delete(sessionId: string): boolean {
    const index = this.sessions.findIndex(({ id }) => id === sessionId)
    if (index === -1) {
      return false
    }
    this.sessions.splice(index, 1)
    return true
  }
}

class FakeTmux {
  readonly created: {
    id: string
    cwd: string
    launchCommand: AgentCommand
  }[] = []
  readonly killed: string[] = []

  async createDetached(id: string, cwd: string, launchCommand: AgentCommand): Promise<void> {
    this.created.push({ id, cwd, launchCommand })
  }

  async kill(id: string): Promise<void> {
    this.killed.push(id)
  }
}

class FakeWorktrees {
  dirty = false
  readonly created: { branch: string; sessionId: string }[] = []
  readonly removed: { cwd: string; force: boolean }[] = []
  readonly rolledBack: string[] = []

  async create(
    _project: { readonly path: string; readonly defaultBranch: string },
    sessionId: string,
    branch: string,
  ): Promise<string> {
    this.created.push({ branch, sessionId })
    return `/srv/projects/.termspace-worktrees/${sessionId}`
  }

  async isDirty(): Promise<boolean> {
    return this.dirty
  }

  async remove(_projectPath: string, cwd: string, force: boolean): Promise<void> {
    this.removed.push({ cwd, force })
  }

  async rollback(_projectPath: string, _cwd: string, branch: string): Promise<void> {
    this.rolledBack.push(branch)
  }
}

class FakeDiffs {
  readonly reads: { session: Session; baseBranch: string }[] = []

  async read(session: Session, baseBranch: string): Promise<DiffResult> {
    this.reads.push({ session, baseBranch })
    return { ...diffResultFixture, sessionId: session.id, baseBranch }
  }
}

function createManager(
  repository: FakeRepository,
  tmux: FakeTmux,
  worktrees?: FakeWorktrees,
  diffs?: FakeDiffs,
): SessionManager {
  return new SessionManager(repository, tmux, {
    createId: () => SID,
    isDirectory: async () => true,
    now: () => 100,
    ...(diffs === undefined ? {} : { diffs }),
    ...(worktrees === undefined ? {} : { worktrees }),
  })
}

describe('SessionManager', () => {
  it('creates tmux first, launches the selected agent, then persists', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    const session = await manager.create({ projectId: 'project-1', name: 'Portal', agent: 'claude' })

    assert.deepEqual(tmux.created, [
      { id: SID, cwd: '/srv/project', launchCommand: ['claude'] },
    ])
    assert.deepEqual(repository.sessions, [session])
    assert.equal(session.state, 'idle')
  })

  it('uses an explicit cwd and leaves shell sessions at the shell', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create({
      projectId: 'project-1',
      name: 'Shell',
      agent: 'shell',
      cwd: '/srv/project/web/',
    })

    assert.deepEqual(tmux.created[0], {
      id: SID,
      cwd: '/srv/project/web',
      launchCommand: [],
    })
  })

  it("launches a project's override instead of the default for that agent", async () => {
    const repository = new FakeRepository()
    repository.setProject({
      id: 'project-1',
      path: '/srv/project',
      defaultBranch: 'main',
      agentCommands: { claude: ['claude', '--model', 'opus'] },
    })
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create({ projectId: 'project-1', name: 'Portal', agent: 'claude' })

    assert.deepEqual(tmux.created[0]?.launchCommand, ['claude', '--model', 'opus'])
  })

  it('leaves the other agent kinds on their defaults when one is overridden', async () => {
    const repository = new FakeRepository()
    repository.setProject({
      id: 'project-1',
      path: '/srv/project',
      defaultBranch: 'main',
      agentCommands: { claude: ['claude', '--resume'] },
    })
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create({ projectId: 'project-1', name: 'Codex', agent: 'codex' })

    assert.deepEqual(tmux.created[0]?.launchCommand, ['codex'])
  })

  it('honours an override that is deliberately empty', async () => {
    const repository = new FakeRepository()
    repository.setProject({
      id: 'project-1',
      path: '/srv/project',
      defaultBranch: 'main',
      // An empty argv is not "unset": it means start this kind at a bare shell.
      agentCommands: { claude: [] },
    })
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create({ projectId: 'project-1', name: 'Portal', agent: 'claude' })

    assert.deepEqual(tmux.created[0]?.launchCommand, [])
  })

  it('refuses a cwd outside its own project, before creating anything', async () => {
    for (const cwd of [
      '/tmp',
      '/srv/project/../../etc',
      '/srv/project-other/x', // prefix match on the string alone would allow this
      '/srv/project', // the project root itself is fine, so this one must pass
    ]) {
      const repository = new FakeRepository()
      const tmux = new FakeTmux()
      const manager = createManager(repository, tmux)

      if (cwd === '/srv/project') {
        await manager.create({ projectId: 'project-1', name: 'Shell', agent: 'shell', cwd })
        assert.equal(tmux.created.length, 1)
        continue
      }

      await assert.rejects(
        manager.create({ projectId: 'project-1', name: 'Shell', agent: 'shell', cwd }),
        (error: unknown) => error instanceof Error,
        `accepted ${cwd}`,
      )
      assert.deepEqual(tmux.created, [], `created tmux for ${cwd}`)
      assert.deepEqual(repository.sessions, [])
    }
  })

  it('rolls tmux back if persistence fails', async () => {
    const repository = new FakeRepository()
    repository.failInsert = true
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await assert.rejects(manager.create({ projectId: 'project-1', name: 'Portal', agent: 'codex' }))
    assert.deepEqual(tmux.killed, [SID])
  })

  it('rejects an unknown project before touching tmux', async () => {
    const repository = new FakeRepository()
    repository.project = null
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await assert.rejects(
      manager.create({ projectId: 'missing', name: 'Portal', agent: 'claude' }),
      SessionProjectNotFoundError,
    )
    assert.deepEqual(tmux.created, [])
  })

  it('kills tmux before deleting the persisted row', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)
    await manager.create({ projectId: 'project-1', name: 'Portal', agent: 'claude' })

    assert.equal(await manager.delete(SID), true)
    assert.deepEqual(tmux.killed, [SID])
    assert.deepEqual(repository.sessions, [])
  })

  it('reads a session diff against its project default branch', async () => {
    const repository = new FakeRepository()
    repository.sessions.push({ ...sessionFixture, id: SID, projectId: 'project-1' })
    const diffs = new FakeDiffs()
    const manager = createManager(repository, new FakeTmux(), undefined, diffs)

    const result = await manager.diff(SID)

    assert.equal(result?.sessionId, SID)
    assert.equal(result?.baseBranch, 'main')
    assert.deepEqual(diffs.reads, [{ session: repository.sessions[0], baseBranch: 'main' }])
    assert.equal(await manager.diff('ses_missing00001'), null)
  })

  it('creates a worktree before tmux and persists its branch and generated cwd', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const worktrees = new FakeWorktrees()
    const manager = createManager(repository, tmux, worktrees)

    const session = await manager.create({
      projectId: 'project-1',
      name: 'Parallel',
      agent: 'codex',
      worktree: true,
      worktreeBranch: 'ts/parallel',
    })

    assert.deepEqual(worktrees.created, [{ sessionId: SID, branch: 'ts/parallel' }])
    assert.equal(session.cwd, `/srv/projects/.termspace-worktrees/${SID}`)
    assert.equal(session.worktreeBranch, 'ts/parallel')
    assert.equal(tmux.created[0]?.cwd, session.cwd)
  })

  it('rolls a new worktree back when session persistence fails', async () => {
    const repository = new FakeRepository()
    repository.failInsert = true
    const tmux = new FakeTmux()
    const worktrees = new FakeWorktrees()
    const manager = createManager(repository, tmux, worktrees)

    await assert.rejects(manager.create({
      projectId: 'project-1',
      name: 'Parallel',
      agent: 'codex',
      worktree: true,
      worktreeBranch: 'ts/parallel',
    }))

    assert.deepEqual(tmux.killed, [SID])
    assert.deepEqual(worktrees.rolledBack, ['ts/parallel'])
  })

  it('refuses dirty worktree deletion before killing tmux', async () => {
    const repository = new FakeRepository()
    repository.sessions.push({
      ...sessionFixture,
      id: SID,
      projectId: 'project-1',
      cwd: `/srv/projects/.termspace-worktrees/${SID}`,
      worktreeBranch: 'ts/parallel',
    })
    const tmux = new FakeTmux()
    const worktrees = new FakeWorktrees()
    worktrees.dirty = true
    const manager = createManager(repository, tmux, worktrees)

    await assert.rejects(manager.delete(SID), WorktreeDirtyError)

    assert.deepEqual(tmux.killed, [])
    assert.equal(repository.sessions.length, 1)
  })

  it('force deletion kills tmux and removes the worktree but preserves manager ownership', async () => {
    const repository = new FakeRepository()
    repository.sessions.push({
      ...sessionFixture,
      id: SID,
      projectId: 'project-1',
      cwd: `/srv/projects/.termspace-worktrees/${SID}`,
      worktreeBranch: 'ts/parallel',
    })
    const tmux = new FakeTmux()
    const worktrees = new FakeWorktrees()
    worktrees.dirty = true
    const manager = createManager(repository, tmux, worktrees)

    assert.equal(await manager.delete(SID, { force: true }), true)
    assert.deepEqual(tmux.killed, [SID])
    assert.deepEqual(worktrees.removed, [{
      cwd: `/srv/projects/.termspace-worktrees/${SID}`,
      force: true,
    }])
    assert.deepEqual(repository.sessions, [])
  })

  it('flags only non-worktree sessions that share a cwd', () => {
    const repository = new FakeRepository()
    repository.sessions.push(
      { ...sessionFixture, id: 'ses_conflict0001', cwd: '/srv/project', worktreeBranch: null },
      { ...sessionFixture, id: 'ses_conflict0002', cwd: '/srv/project', worktreeBranch: null },
      { ...sessionFixture, id: 'ses_worktree0001', cwd: '/srv/project', worktreeBranch: 'ts/x' },
    )
    const manager = createManager(repository, new FakeTmux())

    assert.deepEqual(manager.list().map(({ hasCwdConflict }) => hasCwdConflict), [
      true,
      true,
      false,
    ])
  })
})

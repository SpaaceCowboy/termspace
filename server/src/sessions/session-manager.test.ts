import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { AgentCommand, AgentKind, Session } from '@termspace/contracts'

import type { SessionProject } from './session-repository.js'
import { SessionManager, SessionProjectNotFoundError } from './session-manager.js'

const SID = 'ses_portalui0001'

class FakeRepository {
  readonly sessions: Session[] = []
  failInsert = false
  project: SessionProject | null = {
    id: 'project-1',
    path: '/srv/project',
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

function createManager(repository: FakeRepository, tmux: FakeTmux): SessionManager {
  return new SessionManager(repository, tmux, {
    createId: () => SID,
    isDirectory: async () => true,
    now: () => 100,
  })
}

describe('SessionManager', () => {
  it('creates tmux first, launches the selected agent, then persists', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    const session = await manager.create('project-1', 'Portal', 'claude')

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

    await manager.create('project-1', 'Shell', 'shell', '/srv/project/web/')

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
      agentCommands: { claude: ['claude', '--model', 'opus'] },
    })
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create('project-1', 'Portal', 'claude')

    assert.deepEqual(tmux.created[0]?.launchCommand, ['claude', '--model', 'opus'])
  })

  it('leaves the other agent kinds on their defaults when one is overridden', async () => {
    const repository = new FakeRepository()
    repository.setProject({
      id: 'project-1',
      path: '/srv/project',
      agentCommands: { claude: ['claude', '--resume'] },
    })
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create('project-1', 'Codex', 'codex')

    assert.deepEqual(tmux.created[0]?.launchCommand, ['codex'])
  })

  it('honours an override that is deliberately empty', async () => {
    const repository = new FakeRepository()
    repository.setProject({
      id: 'project-1',
      path: '/srv/project',
      // An empty argv is not "unset": it means start this kind at a bare shell.
      agentCommands: { claude: [] },
    })
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create('project-1', 'Portal', 'claude')

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
        await manager.create('project-1', 'Shell', 'shell', cwd)
        assert.equal(tmux.created.length, 1)
        continue
      }

      await assert.rejects(
        manager.create('project-1', 'Shell', 'shell', cwd),
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

    await assert.rejects(manager.create('project-1', 'Portal', 'codex'))
    assert.deepEqual(tmux.killed, [SID])
  })

  it('rejects an unknown project before touching tmux', async () => {
    const repository = new FakeRepository()
    repository.project = null
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await assert.rejects(
      manager.create('missing', 'Portal', 'claude'),
      SessionProjectNotFoundError,
    )
    assert.deepEqual(tmux.created, [])
  })

  it('kills tmux before deleting the persisted row', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)
    await manager.create('project-1', 'Portal', 'claude')

    assert.equal(await manager.delete(SID), true)
    assert.deepEqual(tmux.killed, [SID])
    assert.deepEqual(repository.sessions, [])
  })
})

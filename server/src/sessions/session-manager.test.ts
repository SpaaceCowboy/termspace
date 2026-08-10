import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { AgentKind, Session } from '@termspace/contracts'

import type { SessionProject } from './session-repository.js'
import { SessionManager, SessionProjectNotFoundError } from './session-manager.js'

const SID = 'ses_portalui0001'

class FakeRepository {
  readonly sessions: Session[] = []
  failInsert = false
  project: SessionProject | null = { id: 'project-1', path: '/srv/project' }

  findProject(): SessionProject | null {
    return this.project
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
    launchCommand: 'claude' | 'codex' | undefined
  }[] = []
  readonly killed: string[] = []

  async createDetached(
    id: string,
    cwd: string,
    launchCommand?: 'claude' | 'codex',
  ): Promise<void> {
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
      { id: SID, cwd: '/srv/project', launchCommand: 'claude' },
    ])
    assert.deepEqual(repository.sessions, [session])
    assert.equal(session.state, 'idle')
  })

  it('uses an explicit cwd and leaves shell sessions at the shell', async () => {
    const repository = new FakeRepository()
    const tmux = new FakeTmux()
    const manager = createManager(repository, tmux)

    await manager.create('project-1', 'Shell', 'shell', '/tmp')

    assert.deepEqual(tmux.created[0], {
      id: SID,
      cwd: '/tmp',
      launchCommand: undefined,
    })
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

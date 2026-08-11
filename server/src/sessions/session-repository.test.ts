import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type { Session } from '@termspace/contracts'
import type Database from 'better-sqlite3'

import { openDatabase } from '../database/connection.js'
import { migrateDatabase } from '../database/migrations.js'
import { SessionRepository } from './session-repository.js'

const SESSION: Session = {
  id: 'ses_portalui0001',
  projectId: 'project-1',
  name: 'Portal',
  agent: 'claude',
  cwd: '/srv/project',
  worktreeBranch: null,
  state: 'idle',
  title: null,
  lastActivityAt: 100,
  createdAt: 100,
}

describe('SessionRepository', () => {
  let database: Database.Database
  let repository: SessionRepository

  beforeEach(() => {
    database = openDatabase(':memory:')
    migrateDatabase(database)
    database
      .prepare(
        `INSERT INTO projects
          (id, slug, name, path, repo_url, default_branch, setup_command, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('project-1', 'project', 'Project', '/srv/project', null, 'main', null, 1)
    repository = new SessionRepository(database)
  })

  afterEach(() => {
    database.close()
  })

  it('finds project paths and round-trips shared Session values', () => {
    assert.deepEqual(repository.findProject('project-1'), {
      id: 'project-1',
      path: '/srv/project',
      agentCommands: {},
    })

    repository.insert(SESSION)

    assert.deepEqual(repository.find(SESSION.id), SESSION)
    assert.deepEqual(repository.list(), [SESSION])
  })

  it('deletes only the requested session row', () => {
    repository.insert(SESSION)
    assert.equal(repository.delete(SESSION.id), true)
    assert.equal(repository.delete(SESSION.id), false)
    assert.deepEqual(repository.list(), [])
  })
})

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import type Database from 'better-sqlite3'
import { z } from 'zod'

import { openDatabase } from './connection.js'
import { migrateDatabase } from './migrations.js'

const NameRowSchema = z.array(z.object({ name: z.string() }))

describe('migrateDatabase', () => {
  let database: Database.Database

  beforeEach(() => {
    database = openDatabase(':memory:')
  })

  afterEach(() => {
    database.close()
  })

  it('creates every Phase 0 table in one ordered migration', () => {
    assert.deepEqual(migrateDatabase(database), {
      applied: ['initial_schema', 'project_agent_commands', 'push_subscriptions'],
      currentVersion: 3,
    })

    const rows = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
    const names = NameRowSchema.parse(rows).map(({ name }) => name)

    assert.deepEqual(names, [
      'layouts',
      'projects',
      'push_subscriptions',
      'schema_migrations',
      'sessions',
      'users',
    ])
  })

  it('is idempotent', () => {
    migrateDatabase(database)
    assert.deepEqual(migrateDatabase(database), {
      applied: [],
      currentVersion: 3,
    })
  })

  it('gives existing projects an empty override map, not the current defaults', () => {
    migrateDatabase(database)
    database
      .prepare(
        `INSERT INTO projects (id, slug, name, path, default_branch, created_at)
         VALUES ('p1', 'p', 'P', '/srv/projects/p', 'main', 1)`,
      )
      .run()

    const row = database.prepare('SELECT agent_commands FROM projects WHERE id = ?').get('p1')

    // Baking the defaults into the column would freeze today's commands into
    // every row that predates the feature; absent must keep meaning "default".
    assert.deepEqual(z.object({ agent_commands: z.string() }).parse(row), {
      agent_commands: '{}',
    })
  })

  it('rejects an agent_commands value that is not JSON', () => {
    migrateDatabase(database)
    assert.throws(() =>
      database
        .prepare(
          `INSERT INTO projects (id, slug, name, path, default_branch, created_at, agent_commands)
           VALUES ('p2', 'q', 'Q', '/srv/projects/q', 'main', 1, 'not json')`,
        )
        .run(),
    )
  })

  it('enforces the session agent constraint', () => {
    migrateDatabase(database)
    database
      .prepare(
        `INSERT INTO projects
          (id, slug, name, path, repo_url, default_branch, setup_command, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('project-1', 'project', 'Project', '/srv/project', null, 'main', null, 1)

    assert.throws(() => {
      database
        .prepare(
          `INSERT INTO sessions
            (id, project_id, name, agent, cwd, worktree_branch, state, title,
             last_activity_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'session-1',
          'project-1',
          'Session',
          'other',
          '/srv/project',
          null,
          'idle',
          null,
          1,
          1,
        )
    })
  })
})

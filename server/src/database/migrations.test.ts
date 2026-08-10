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
      applied: ['initial_schema'],
      currentVersion: 1,
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
      'schema_migrations',
      'sessions',
      'users',
    ])
  })

  it('is idempotent', () => {
    migrateDatabase(database)
    assert.deepEqual(migrateDatabase(database), {
      applied: [],
      currentVersion: 1,
    })
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

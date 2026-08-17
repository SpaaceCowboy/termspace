import type Database from 'better-sqlite3'
import { z } from 'zod'

interface Migration {
  readonly version: number
  readonly name: string
  readonly sql: string
}

const MigrationRecordSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().min(1),
})

const MigrationRecordsSchema = z.array(MigrationRecordSchema)

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        totp_secret TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        repo_url TEXT,
        default_branch TEXT NOT NULL,
        setup_command TEXT,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        agent TEXT NOT NULL CHECK (agent IN ('claude', 'codex', 'shell')),
        cwd TEXT NOT NULL,
        worktree_branch TEXT,
        state TEXT NOT NULL CHECK (state IN ('working', 'idle', 'needs-you', 'dead')),
        title TEXT,
        last_activity_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;

      CREATE INDEX sessions_project_id_idx ON sessions(project_id);

      CREATE TABLE layouts (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL CHECK (json_valid(data)),
        updated_at INTEGER NOT NULL
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'project_agent_commands',
    /**
     * Per-agent launch overrides, as a JSON object of `kind -> argv array`. An
     * absent key means "use the server default", which is why the column
     * defaults to an empty object rather than to the defaults themselves —
     * baking them in here would freeze today's defaults into every existing row.
     */
    sql: `
      ALTER TABLE projects
        ADD COLUMN agent_commands TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(agent_commands));
    `,
  },
  {
    version: 3,
    name: 'push_subscriptions',
    /**
     * One row per browser that asked to be notified. `endpoint` is the identity
     * — the same browser re-subscribing produces the same endpoint — so it is
     * UNIQUE and a re-register is an upsert rather than a duplicate.
     *
     * Deleted with the user, because a subscription is permission granted by a
     * person and must not outlive them.
     */
    sql: `
      CREATE TABLE push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER
      ) STRICT;

      CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions(user_id);
    `,
  },
  {
    version: 4,
    name: 'user_favorites',
    sql: `
      CREATE TABLE user_favorites (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        project_ids TEXT NOT NULL CHECK (json_valid(project_ids)),
        session_ids TEXT NOT NULL CHECK (json_valid(session_ids)),
        updated_at INTEGER NOT NULL
      ) STRICT;
    `,
  },
]

export interface MigrationResult {
  readonly applied: readonly string[]
  readonly currentVersion: number
}

export function migrateDatabase(
  database: Database.Database,
): MigrationResult {
  ensureMigrationTable(database)
  const appliedRecords = readAppliedMigrations(database)
  validateMigrationHistory(appliedRecords)

  const appliedNames: string[] = []
  const applyMigration = database.transaction((migration: Migration) => {
    database.exec(migration.sql)
    database
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      )
      .run(migration.version, migration.name, Date.now())
  })

  for (const migration of migrations.slice(appliedRecords.length)) {
    applyMigration(migration)
    appliedNames.push(migration.name)
  }

  return {
    applied: appliedNames,
    currentVersion: migrations.length,
  }
}

function ensureMigrationTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    ) STRICT;
  `)
}

function readAppliedMigrations(
  database: Database.Database,
): z.output<typeof MigrationRecordsSchema> {
  const rows = database
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all()
  return MigrationRecordsSchema.parse(rows)
}

function validateMigrationHistory(
  appliedRecords: z.output<typeof MigrationRecordsSchema>,
): void {
  for (const [index, applied] of appliedRecords.entries()) {
    const expected = migrations[index]
    if (expected === undefined) {
      throw new Error(
        `Database migration ${applied.version}:${applied.name} is newer than this server`,
      )
    }
    if (applied.version !== expected.version || applied.name !== expected.name) {
      throw new Error(
        `Database migration history diverged at version ${applied.version}`,
      )
    }
  }
}

import type { Session } from '@termspace/contracts'
import type Database from 'better-sqlite3'
import { z } from 'zod'

import { parseAgentCommands } from '../projects/agent-commands.js'

const ProjectRowSchema = z
  .object({
    id: z.string(),
    path: z.string(),
    agent_commands: z.string(),
  })
  .transform((row) => ({
    id: row.id,
    path: row.path,
    agentCommands: parseAgentCommands(row.agent_commands),
  }))

const SessionRowSchema = z
  .object({
    id: z.string(),
    project_id: z.string(),
    name: z.string(),
    agent: z.enum(['claude', 'codex', 'shell']),
    cwd: z.string(),
    worktree_branch: z.string().nullable(),
    state: z.enum(['working', 'idle', 'needs-you', 'dead']),
    title: z.string().nullable(),
    last_activity_at: z.number().int(),
    created_at: z.number().int(),
  })
  .transform(
    (row): Session => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      agent: row.agent,
      cwd: row.cwd,
      worktreeBranch: row.worktree_branch,
      state: row.state,
      title: row.title,
      lastActivityAt: row.last_activity_at,
      createdAt: row.created_at,
    }),
  )

export type SessionProject = z.output<typeof ProjectRowSchema>

export class SessionRepository {
  readonly #database: Database.Database

  constructor(database: Database.Database) {
    this.#database = database
  }

  findProject(projectId: string): SessionProject | null {
    const row = this.#database
      .prepare('SELECT id, path, agent_commands FROM projects WHERE id = ?')
      .get(projectId)
    return row === undefined ? null : ProjectRowSchema.parse(row)
  }

  insert(session: Session): void {
    this.#database
      .prepare(
        `INSERT INTO sessions
          (id, project_id, name, agent, cwd, worktree_branch, state, title,
           last_activity_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.projectId,
        session.name,
        session.agent,
        session.cwd,
        session.worktreeBranch,
        session.state,
        session.title,
        session.lastActivityAt,
        session.createdAt,
      )
  }

  find(sessionId: string): Session | null {
    const row = this.#database
      .prepare(
        `SELECT id, project_id, name, agent, cwd, worktree_branch, state,
                title, last_activity_at, created_at
         FROM sessions WHERE id = ?`,
      )
      .get(sessionId)
    return row === undefined ? null : SessionRowSchema.parse(row)
  }

  list(): readonly Session[] {
    return z
      .array(SessionRowSchema)
      .parse(
        this.#database
          .prepare(
            `SELECT id, project_id, name, agent, cwd, worktree_branch, state,
                    title, last_activity_at, created_at
             FROM sessions ORDER BY created_at, id`,
          )
          .all(),
      )
  }

  delete(sessionId: string): boolean {
    const result = this.#database
      .prepare('DELETE FROM sessions WHERE id = ?')
      .run(sessionId)
    return result.changes > 0
  }
}

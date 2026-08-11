import type { Project } from '@termspace/contracts'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const ProjectRowSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    path: z.string(),
    repo_url: z.string().nullable(),
    default_branch: z.string(),
    setup_command: z.string().nullable(),
    created_at: z.number().int(),
  })
  .transform(
    (row): Project => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      path: row.path,
      repoUrl: row.repo_url,
      defaultBranch: row.default_branch,
      setupCommand: row.setup_command,
      createdAt: row.created_at,
    }),
  )

const COLUMNS = `id, slug, name, path, repo_url, default_branch, setup_command, created_at`

export class ProjectRepository {
  readonly #database: Database.Database

  constructor(database: Database.Database) {
    this.#database = database
  }

  insert(project: Project): void {
    this.#database
      .prepare(
        `INSERT INTO projects (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        project.id,
        project.slug,
        project.name,
        project.path,
        project.repoUrl,
        project.defaultBranch,
        project.setupCommand,
        project.createdAt,
      )
  }

  find(projectId: string): Project | null {
    const row = this.#database
      .prepare(`SELECT ${COLUMNS} FROM projects WHERE id = ?`)
      .get(projectId)
    return row === undefined ? null : ProjectRowSchema.parse(row)
  }

  list(): readonly Project[] {
    return z
      .array(ProjectRowSchema)
      .parse(
        this.#database
          .prepare(`SELECT ${COLUMNS} FROM projects ORDER BY created_at, id`)
          .all(),
      )
  }

  /** `slug` and `path` are both UNIQUE, so this is what makes a conflict legible. */
  findConflict(slug: string, path: string): Project | null {
    const row = this.#database
      .prepare(`SELECT ${COLUMNS} FROM projects WHERE slug = ? OR path = ?`)
      .get(slug, path)
    return row === undefined ? null : ProjectRowSchema.parse(row)
  }

  countSessions(projectId: string): number {
    const row = this.#database
      .prepare('SELECT COUNT(*) AS count FROM sessions WHERE project_id = ?')
      .get(projectId)
    return z.object({ count: z.number().int() }).parse(row).count
  }

  delete(projectId: string): boolean {
    return (
      this.#database.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
        .changes > 0
    )
  }

  /** Slugs are unique; a second "Portal UI" becomes `portal-ui-2`. */
  claimSlug(base: string): string {
    const taken = new Set(
      z
        .array(z.object({ slug: z.string() }))
        .parse(this.#database.prepare('SELECT slug FROM projects').all())
        .map((row) => row.slug),
    )
    if (!taken.has(base)) {
      return base
    }
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base}-${String(suffix)}`
      if (!taken.has(candidate)) {
        return candidate
      }
    }
  }
}

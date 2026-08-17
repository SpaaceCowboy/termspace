import type { Favorites } from '@termspace/contracts'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const IdListSchema = z.array(z.string().min(1).max(128)).max(500)
const FavoritesRowSchema = z.object({
  project_ids: z.string(),
  session_ids: z.string(),
})

export class FavoritesRepository {
  readonly #database: Database.Database

  constructor(database: Database.Database) {
    this.#database = database
  }

  find(
    userId: string,
    knownProjectIds: ReadonlySet<string>,
    knownSessionIds: ReadonlySet<string>,
  ): Favorites {
    const raw = this.#database
      .prepare('SELECT project_ids, session_ids FROM user_favorites WHERE user_id = ?')
      .get(userId)
    if (raw === undefined) {
      return { projectIds: [], sessionIds: [] }
    }
    const row = FavoritesRowSchema.parse(raw)
    return {
      projectIds: parseIds(row.project_ids).filter((id) => knownProjectIds.has(id)),
      sessionIds: parseIds(row.session_ids).filter((id) => knownSessionIds.has(id)),
    }
  }

  save(
    userId: string,
    favorites: Favorites,
    knownProjectIds: ReadonlySet<string>,
    knownSessionIds: ReadonlySet<string>,
    updatedAt: number,
  ): Favorites {
    const filtered: Favorites = {
      projectIds: uniqueKnown(favorites.projectIds, knownProjectIds),
      sessionIds: uniqueKnown(favorites.sessionIds, knownSessionIds),
    }
    this.#database
      .prepare(
        `INSERT INTO user_favorites
          (user_id, project_ids, session_ids, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           project_ids = excluded.project_ids,
           session_ids = excluded.session_ids,
           updated_at = excluded.updated_at`,
      )
      .run(
        userId,
        JSON.stringify(filtered.projectIds),
        JSON.stringify(filtered.sessionIds),
        updatedAt,
      )
    return filtered
  }
}

function parseIds(value: string): readonly string[] {
  return IdListSchema.parse(JSON.parse(value) as unknown)
}

function uniqueKnown(ids: readonly string[], known: ReadonlySet<string>): readonly string[] {
  return [...new Set(ids)].filter((id) => known.has(id))
}

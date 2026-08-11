import type { Layout, LayoutInput } from '@termspace/contracts'
import { EMPTY_LAYOUT, LAYOUT_MODES, normalizeLayout } from '@termspace/contracts'
import type Database from 'better-sqlite3'
import { z } from 'zod'

/**
 * The stored JSON is validated on the way out, not trusted. The column only has
 * a `json_valid` CHECK on it, and a layout written by an older build is a
 * likelier source of garbage here than a hostile one.
 */
const StoredLayoutSchema = z.object({
  mode: z.enum(LAYOUT_MODES),
  slots: z.array(z.string().nullable()),
  focusedSlot: z.number(),
})

const LayoutRowSchema = z.object({ data: z.string(), updated_at: z.number().int() })

export class LayoutRepository {
  readonly #database: Database.Database

  constructor(database: Database.Database) {
    this.#database = database
  }

  /**
   * A user who has never arranged anything has no row, and that is not an
   * error — they get the empty layout. Slots pointing at sessions that no
   * longer exist are emptied on the way out, so deleting a session in one tab
   * cannot leave a ghost pane in another.
   */
  find(userId: string, knownSessionIds: ReadonlySet<string>): Layout {
    const row = this.#database
      .prepare('SELECT data, updated_at FROM layouts WHERE user_id = ?')
      .get(userId)
    if (row === undefined) {
      return EMPTY_LAYOUT
    }

    const parsed = LayoutRowSchema.parse(row)
    const stored = StoredLayoutSchema.safeParse(safeJsonParse(parsed.data))
    if (!stored.success) {
      return EMPTY_LAYOUT
    }

    return {
      ...normalizeLayout(stored.data, { knownSessionIds }),
      updatedAt: parsed.updated_at,
    }
  }

  save(userId: string, input: LayoutInput, updatedAt: number): Layout {
    const layout: Layout = { ...input, updatedAt }
    this.#database
      .prepare(
        `INSERT INTO layouts (user_id, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(input), updatedAt)
    return layout
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

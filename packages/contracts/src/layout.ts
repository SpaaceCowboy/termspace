export const LAYOUT_MODES = ['single', 'split', 'grid', 'tabs'] as const

export type LayoutMode = (typeof LAYOUT_MODES)[number]

/**
 * Every layout carries the same number of slots regardless of mode, so
 * narrowing from `grid` to `single` and back does not throw away what was in
 * slots 2-4. The mode decides how many of them are *live*, not how many exist.
 */
export const LAYOUT_MAX_SLOTS = 8

/**
 * How many slots a mode renders. `tabs` keeps every slot but paints one at a
 * time, so its capacity is the whole array and only `focusedSlot` is on screen.
 */
export const LAYOUT_SLOT_CAPACITY: Readonly<Record<LayoutMode, number>> = {
  single: 1,
  split: 2,
  grid: 4,
  tabs: LAYOUT_MAX_SLOTS,
}

/**
 * The workspace arrangement for one user. `slots` maps a slot index to the
 * session shown there, `null` for an empty slot. A session id appears at most
 * once: two panes attached to one tmux session would fight over its size.
 */
export interface Layout {
  mode: LayoutMode
  slots: readonly (string | null)[]
  focusedSlot: number
  updatedAt: number
}

/** The body of `PUT /api/layouts`. The server stamps `updatedAt` itself. */
export type LayoutInput = Omit<Layout, 'updatedAt'>

export interface NormalizeLayoutOptions {
  /**
   * When given, a slot holding a session id outside this set is emptied. That
   * is how a layout stops pointing at a session someone deleted from another
   * tab, without a migration.
   */
  readonly knownSessionIds?: ReadonlySet<string>
}

/**
 * The single definition of a well-formed layout, shared by the server (after
 * structural validation, before it stores anything) and the client (after every
 * local edit). Total: it takes whatever it is handed and returns something
 * valid, because the alternative is a workspace that will not render.
 */
export function normalizeLayout(
  input: LayoutInput,
  options: NormalizeLayoutOptions = {},
): LayoutInput {
  const mode: LayoutMode = LAYOUT_MODES.includes(input.mode) ? input.mode : 'single'
  const seen = new Set<string>()
  const slots: (string | null)[] = []

  for (let index = 0; index < LAYOUT_MAX_SLOTS; index += 1) {
    const sid = input.slots[index] ?? null
    if (
      sid === null ||
      seen.has(sid) ||
      (options.knownSessionIds !== undefined && !options.knownSessionIds.has(sid))
    ) {
      slots.push(null)
      continue
    }
    seen.add(sid)
    slots.push(sid)
  }

  return { mode, slots, focusedSlot: resolveFocus(mode, slots, input.focusedSlot) }
}

/** Slot indices this mode actually renders. */
export function layoutSlotIndices(mode: LayoutMode): readonly number[] {
  return Array.from({ length: LAYOUT_SLOT_CAPACITY[mode] }, (_, index) => index)
}

function resolveFocus(
  mode: LayoutMode,
  slots: readonly (string | null)[],
  requested: number,
): number {
  const capacity = LAYOUT_SLOT_CAPACITY[mode]
  const inRange =
    Number.isInteger(requested) && requested >= 0 && requested < capacity ? requested : 0
  if (slots[inRange] != null) {
    return inRange
  }
  // Focus on an empty slot while another live slot holds a session means
  // keystrokes would go nowhere, so move it to the first slot that can take them.
  const firstFilled = slots.findIndex((sid, index) => index < capacity && sid !== null)
  return firstFilled === -1 ? inRange : firstFilled
}

export const EMPTY_LAYOUT: Layout = {
  mode: 'single',
  slots: Array.from({ length: LAYOUT_MAX_SLOTS }, () => null),
  focusedSlot: 0,
  updatedAt: 0,
}

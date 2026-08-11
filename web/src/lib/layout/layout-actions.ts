import {
  LAYOUT_SLOT_CAPACITY,
  normalizeLayout,
  type LayoutInput,
  type LayoutMode,
} from '@termspace/contracts'

/**
 * Every edit the workspace can make to a layout, as pure functions. Each one
 * returns a normalized layout, so nothing downstream has to defend itself
 * against a slot array that has gone out of shape.
 */

export function setMode(layout: LayoutInput, mode: LayoutMode): LayoutInput {
  return normalizeLayout({ ...layout, mode })
}

export function focusSlot(layout: LayoutInput, index: number): LayoutInput {
  return normalizeLayout({ ...layout, focusedSlot: index })
}

export function assignSession(layout: LayoutInput, index: number, sid: string): LayoutInput {
  // Emptied first, then placed: normalization resolves a duplicate in favour of
  // the earliest slot, which would silently turn a move backwards into a no-op.
  const slots = layout.slots.map((slot) => (slot === sid ? null : slot))
  slots[index] = sid
  return normalizeLayout({ ...layout, slots, focusedSlot: index })
}

export function clearSlot(layout: LayoutInput, index: number): LayoutInput {
  const slots = [...layout.slots]
  slots[index] = null
  return normalizeLayout({ ...layout, slots })
}

export function withoutSession(layout: LayoutInput, sid: string): LayoutInput {
  return normalizeLayout({
    ...layout,
    slots: layout.slots.map((slot) => (slot === sid ? null : slot)),
  })
}

/**
 * What clicking a session in the sidebar means: show it, wherever that has to
 * happen. Already on screen, so just focus it; otherwise fill the focused slot
 * if it is free, then the first free one, and only replace as a last resort.
 */
export function showSession(layout: LayoutInput, sid: string): LayoutInput {
  const capacity = LAYOUT_SLOT_CAPACITY[layout.mode]
  const live = layout.slots.slice(0, capacity)

  const already = live.indexOf(sid)
  if (already !== -1) {
    return focusSlot(layout, already)
  }
  if (live[layout.focusedSlot] == null) {
    return assignSession(layout, layout.focusedSlot, sid)
  }
  const free = live.indexOf(null)
  return assignSession(layout, free === -1 ? layout.focusedSlot : free, sid)
}

/** The sessions this layout actually renders, in slot order. */
export function liveSessionIds(layout: LayoutInput): readonly string[] {
  return layout.slots
    .slice(0, LAYOUT_SLOT_CAPACITY[layout.mode])
    .filter((sid): sid is string => sid !== null)
}

export function layoutEquals(a: LayoutInput, b: LayoutInput): boolean {
  return (
    a.mode === b.mode &&
    a.focusedSlot === b.focusedSlot &&
    a.slots.length === b.slots.length &&
    a.slots.every((sid, index) => sid === b.slots[index])
  )
}

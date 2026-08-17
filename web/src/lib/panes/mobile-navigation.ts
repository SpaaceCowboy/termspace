import { LAYOUT_SLOT_CAPACITY, type LayoutInput } from '@termspace/contracts'

export type PaneDirection = -1 | 1

export function occupiedSlotIndices(layout: LayoutInput): readonly number[] {
  const capacity = LAYOUT_SLOT_CAPACITY[layout.mode]
  const indices: number[] = []
  for (let index = 0; index < capacity; index += 1) {
    if ((layout.slots[index] ?? null) !== null) {
      indices.push(index)
    }
  }
  return indices
}

export function adjacentOccupiedSlot(
  layout: LayoutInput,
  direction: PaneDirection,
): number | null {
  const occupied = occupiedSlotIndices(layout)
  const position = occupied.indexOf(layout.focusedSlot)
  if (position === -1) {
    return occupied[0] ?? null
  }
  return occupied[position + direction] ?? null
}

/** Horizontal, intentional swipes only; vertical terminal scrolling wins. */
export function swipeDirection(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  minimumDistance = 48,
): PaneDirection | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < minimumDistance || Math.abs(dx) <= Math.abs(dy)) {
    return null
  }
  return dx < 0 ? 1 : -1
}

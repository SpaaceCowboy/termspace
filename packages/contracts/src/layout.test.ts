import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  EMPTY_LAYOUT,
  LAYOUT_MAX_SLOTS,
  LAYOUT_MODES,
  LAYOUT_SLOT_CAPACITY,
  layoutSlotIndices,
  normalizeLayout,
  type LayoutInput,
} from './layout.js'

const SID_A = 'ses_aaaaaaaa0001'
const SID_B = 'ses_bbbbbbbb0002'
const SID_C = 'ses_cccccccc0003'

function layout(partial: Partial<LayoutInput> = {}): LayoutInput {
  return {
    mode: partial.mode ?? 'grid',
    slots: partial.slots ?? [],
    focusedSlot: partial.focusedSlot ?? 0,
  }
}

test('every mode has a capacity, and none exceeds the slot array', () => {
  for (const mode of LAYOUT_MODES) {
    const capacity = LAYOUT_SLOT_CAPACITY[mode]
    assert.ok(capacity >= 1, `${mode} renders nothing`)
    assert.ok(capacity <= LAYOUT_MAX_SLOTS, `${mode} renders more slots than exist`)
    assert.equal(layoutSlotIndices(mode).length, capacity)
  }
})

test('normalize pads a short slot array to the full width', () => {
  const result = normalizeLayout(layout({ slots: [SID_A] }))
  assert.equal(result.slots.length, LAYOUT_MAX_SLOTS)
  assert.equal(result.slots[0], SID_A)
  assert.equal(result.slots[1], null)
})

test('normalize truncates a slot array longer than the maximum', () => {
  const overlong = Array.from({ length: LAYOUT_MAX_SLOTS + 3 }, (_, index) => `ses_${index}`)
  const result = normalizeLayout(layout({ slots: overlong }))
  assert.equal(result.slots.length, LAYOUT_MAX_SLOTS)
})

test('normalize empties a duplicate session, keeping the first slot it sits in', () => {
  const result = normalizeLayout(layout({ slots: [SID_A, SID_B, SID_A] }))
  assert.deepEqual(result.slots.slice(0, 3), [SID_A, SID_B, null])
})

test('normalize empties slots holding a session that no longer exists', () => {
  const result = normalizeLayout(layout({ slots: [SID_A, SID_B] }), {
    knownSessionIds: new Set([SID_B]),
  })
  assert.deepEqual(result.slots.slice(0, 2), [null, SID_B])
})

test('a mode narrowing does not discard the sessions parked past its capacity', () => {
  const wide = normalizeLayout(layout({ mode: 'grid', slots: [SID_A, SID_B, SID_C] }))
  const narrow = normalizeLayout({ ...wide, mode: 'single' })
  assert.equal(narrow.slots[2], SID_C)
  assert.deepEqual(normalizeLayout({ ...narrow, mode: 'grid' }).slots, wide.slots)
})

test('focus outside the current mode capacity is pulled back into it', () => {
  const result = normalizeLayout(
    layout({ mode: 'split', slots: [SID_A, SID_B, SID_C], focusedSlot: 2 }),
  )
  assert.equal(result.focusedSlot, 0)
})

test('focus on an empty slot moves to the first live slot that can take input', () => {
  const result = normalizeLayout(
    layout({ mode: 'grid', slots: [null, null, SID_C], focusedSlot: 0 }),
  )
  assert.equal(result.focusedSlot, 2)
})

test('focus stays put when every live slot is empty', () => {
  const result = normalizeLayout(layout({ mode: 'grid', slots: [], focusedSlot: 3 }))
  assert.equal(result.focusedSlot, 3)
})

test('a non-integer or negative focus falls back to the first slot', () => {
  assert.equal(normalizeLayout(layout({ focusedSlot: -1 })).focusedSlot, 0)
  assert.equal(normalizeLayout(layout({ focusedSlot: 1.5 })).focusedSlot, 0)
  assert.equal(normalizeLayout(layout({ focusedSlot: Number.NaN })).focusedSlot, 0)
})

test('normalize is idempotent', () => {
  const once = normalizeLayout(layout({ slots: [SID_A, null, SID_A, SID_B], focusedSlot: 9 }))
  assert.deepEqual(normalizeLayout(once), once)
})

test('the empty layout is already normal', () => {
  const { updatedAt: _ignored, ...input } = EMPTY_LAYOUT
  assert.deepEqual(normalizeLayout(input), input)
})

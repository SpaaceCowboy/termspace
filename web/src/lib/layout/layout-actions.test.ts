import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeLayout, type LayoutInput } from '@termspace/contracts'

import {
  assignSession,
  clearSlot,
  focusSlot,
  layoutEquals,
  liveSessionIds,
  setMode,
  showSession,
  withoutSession,
} from './layout-actions.ts'

const SID_A = 'ses_aaaaaaaa0001'
const SID_B = 'ses_bbbbbbbb0002'
const SID_C = 'ses_cccccccc0003'

function layout(partial: Partial<LayoutInput> = {}): LayoutInput {
  return normalizeLayout({
    mode: partial.mode ?? 'grid',
    slots: partial.slots ?? [],
    focusedSlot: partial.focusedSlot ?? 0,
  })
}

test('showing a session that is already on screen only moves focus', () => {
  const before = layout({ slots: [SID_A, SID_B], focusedSlot: 0 })
  const after = showSession(before, SID_B)
  assert.equal(after.focusedSlot, 1)
  assert.deepEqual(after.slots, before.slots)
})

test('showing a session fills the focused slot when it is free', () => {
  const after = showSession(layout({ slots: [null, SID_B], focusedSlot: 0 }), SID_A)
  assert.equal(after.slots[0], SID_A)
  assert.equal(after.focusedSlot, 0)
})

test('showing a session takes the first free slot rather than evicting anyone', () => {
  const after = showSession(layout({ slots: [SID_A, null, SID_C], focusedSlot: 0 }), SID_B)
  assert.deepEqual(after.slots.slice(0, 3), [SID_A, SID_B, SID_C])
  assert.equal(after.focusedSlot, 1)
})

test('showing a session replaces the focused pane only when the layout is full', () => {
  const before = layout({ mode: 'split', slots: [SID_A, SID_B], focusedSlot: 1 })
  const after = showSession(before, SID_C)
  assert.deepEqual(after.slots.slice(0, 2), [SID_A, SID_C])
  assert.equal(after.focusedSlot, 1)
})

test('showing a session parked past the current capacity moves it into view once', () => {
  const before = layout({ mode: 'single', slots: [SID_A, SID_B], focusedSlot: 0 })
  const after = showSession(before, SID_B)
  assert.equal(after.slots[0], SID_B)
  assert.equal(
    after.slots.filter((sid) => sid === SID_B).length,
    1,
    'a session must never occupy two slots',
  )
})

test('assigning a session moves it rather than cloning it', () => {
  const after = assignSession(layout({ slots: [SID_A, SID_B] }), 2, SID_A)
  assert.deepEqual(after.slots.slice(0, 3), [null, SID_B, SID_A])
  assert.equal(after.focusedSlot, 2)
})

test('clearing a slot leaves the rest alone and moves focus off the hole', () => {
  const after = clearSlot(layout({ slots: [SID_A, SID_B], focusedSlot: 0 }), 0)
  assert.deepEqual(after.slots.slice(0, 2), [null, SID_B])
  assert.equal(after.focusedSlot, 1)
})

test('a deleted session is removed from every slot it was parked in', () => {
  const after = withoutSession(layout({ mode: 'tabs', slots: [SID_A, SID_B, SID_A] }), SID_A)
  assert.equal(after.slots.includes(SID_A), false)
})

test('switching mode keeps parked sessions and reports only the live ones', () => {
  const wide = layout({ mode: 'grid', slots: [SID_A, SID_B, SID_C], focusedSlot: 2 })
  assert.deepEqual(liveSessionIds(wide), [SID_A, SID_B, SID_C])

  const narrow = setMode(wide, 'single')
  assert.deepEqual(liveSessionIds(narrow), [SID_A])
  assert.equal(narrow.focusedSlot, 0, 'focus came back inside the visible slot')
  assert.deepEqual(liveSessionIds(setMode(narrow, 'grid')), [SID_A, SID_B, SID_C])
})

test('focusing a slot outside the mode is refused rather than stored', () => {
  const after = focusSlot(layout({ mode: 'split', slots: [SID_A, SID_B, SID_C] }), 2)
  assert.equal(after.focusedSlot, 0)
})

test('layoutEquals sees slot, mode, and focus changes and nothing else', () => {
  const base = layout({ slots: [SID_A, SID_B] })
  assert.equal(layoutEquals(base, { ...base, slots: [...base.slots] }), true)
  assert.equal(layoutEquals(base, setMode(base, 'tabs')), false)
  assert.equal(layoutEquals(base, assignSession(base, 2, SID_C)), false)
  assert.equal(layoutEquals(base, focusSlot(base, 1)), false)
})

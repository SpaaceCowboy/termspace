import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { layoutFixture } from '@termspace/contracts'

import {
  adjacentOccupiedSlot,
  occupiedSlotIndices,
  swipeDirection,
} from './mobile-navigation.ts'

describe('mobile pane navigation', () => {
  const layout = {
    ...layoutFixture,
    mode: 'grid' as const,
    slots: ['ses_aaaaaaaa0001', null, 'ses_bbbbbbbb0002', 'ses_cccccccc0003'],
    focusedSlot: 2,
  }

  it('moves through occupied slots without landing on holes or wrapping', () => {
    assert.deepEqual(occupiedSlotIndices(layout), [0, 2, 3])
    assert.equal(adjacentOccupiedSlot(layout, -1), 0)
    assert.equal(adjacentOccupiedSlot(layout, 1), 3)
    assert.equal(adjacentOccupiedSlot({ ...layout, focusedSlot: 3 }, 1), null)
  })

  it('recognizes deliberate horizontal swipes but leaves vertical scrolling alone', () => {
    assert.equal(swipeDirection({ x: 200, y: 20 }, { x: 100, y: 30 }), 1)
    assert.equal(swipeDirection({ x: 100, y: 20 }, { x: 200, y: 30 }), -1)
    assert.equal(swipeDirection({ x: 100, y: 20 }, { x: 130, y: 22 }), null)
    assert.equal(swipeDirection({ x: 100, y: 20 }, { x: 160, y: 120 }), null)
  })
})

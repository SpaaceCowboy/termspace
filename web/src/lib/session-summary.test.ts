import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Session, SessionState } from '@termspace/contracts'
import { sessionFixture } from '@termspace/contracts'

import { countNeedingYou, documentTitle, worstState } from './session-summary.ts'

const at = (...states: readonly SessionState[]): Session[] =>
  states.map((state, index) => ({
    ...sessionFixture,
    id: `ses_fixture${String(index).padStart(5, '0')}`,
    state,
  }))

describe('worstState', () => {
  it('is null with no sessions at all', () => {
    assert.equal(worstState([]), null)
  })

  it('ranks needs-you above everything, including dead', () => {
    // A dead session is over; a prompt is a person blocked right now.
    assert.equal(worstState(at('idle', 'dead', 'needs-you', 'working')), 'needs-you')
    assert.equal(worstState(at('idle', 'dead', 'working')), 'dead')
    assert.equal(worstState(at('idle', 'working')), 'working')
    assert.equal(worstState(at('idle', 'idle')), 'idle')
  })
})

describe('documentTitle', () => {
  it('leads with the count, which survives a narrow tab', () => {
    assert.equal(documentTitle(at('needs-you', 'needs-you', 'idle')), '(2) Termspace — needs you')
  })

  it('falls back through the other states', () => {
    assert.equal(documentTitle(at('dead', 'idle')), 'Termspace — a session ended')
    assert.equal(documentTitle(at('working', 'idle')), 'Termspace — working')
    assert.equal(documentTitle(at('idle')), 'Termspace')
    assert.equal(documentTitle([]), 'Termspace')
  })
})

describe('countNeedingYou', () => {
  it('counts only the sessions actually waiting', () => {
    assert.equal(countNeedingYou(at('needs-you', 'working', 'needs-you', 'dead')), 2)
    assert.equal(countNeedingYou(at('idle')), 0)
  })
})

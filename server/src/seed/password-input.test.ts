import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyPasswordChunk } from './password-input.js'

describe('applyPasswordChunk', () => {
  it('masks printable input and completes on enter', () => {
    assert.deepEqual(applyPasswordChunk('', 'secret\r'), {
      cancelled: false,
      completed: true,
      maskedOutput: '******',
      value: 'secret',
    })
  })

  it('applies backspace without exposing the removed character', () => {
    assert.deepEqual(applyPasswordChunk('abc', '\u007fD'), {
      cancelled: false,
      completed: false,
      maskedOutput: '\b \b*',
      value: 'abD',
    })
  })

  it('cancels on ctrl-c', () => {
    assert.deepEqual(applyPasswordChunk('partial', '\u0003'), {
      cancelled: true,
      completed: false,
      maskedOutput: '',
      value: 'partial',
    })
  })
})

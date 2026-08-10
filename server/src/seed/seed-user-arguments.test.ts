import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseSeedUserArguments } from './seed-user-arguments.js'

describe('parseSeedUserArguments', () => {
  it('accepts a directly forwarded username', () => {
    assert.equal(parseSeedUserArguments(['owner']), 'owner')
  })

  it('accepts pnpm forwarding with a separator', () => {
    assert.equal(parseSeedUserArguments(['--', 'owner']), 'owner')
  })

  it('rejects missing and extra arguments', () => {
    assert.throws(() => parseSeedUserArguments([]))
    assert.throws(() => parseSeedUserArguments(['owner', 'extra']))
  })
})

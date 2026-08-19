import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionExitCopy } from './session-runtime.ts'

test('session exit copy explains common causes and preserves unknown codes', () => {
  assert.match(sessionExitCopy(127).title, /not found/)
  assert.match(sessionExitCopy(137).title, /memory limit/)
  assert.match(sessionExitCopy(null).title, /without an exit status/)
  assert.equal(sessionExitCopy(23).title, 'Session stopped with exit code 23.')
})

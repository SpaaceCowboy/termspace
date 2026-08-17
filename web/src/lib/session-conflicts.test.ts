import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionFixture } from '@termspace/contracts'

import { withCwdConflicts } from './session-conflicts.ts'

test('only non-worktree sessions sharing a cwd are flagged', () => {
  const result = withCwdConflicts([
    { ...sessionFixture, id: 'ses_conflict0001', worktreeBranch: null },
    { ...sessionFixture, id: 'ses_conflict0002', worktreeBranch: null },
    { ...sessionFixture, id: 'ses_worktree0001', worktreeBranch: 'ts/one' },
  ])

  assert.deepEqual(result.map(({ hasCwdConflict }) => hasCwdConflict), [true, true, false])
})

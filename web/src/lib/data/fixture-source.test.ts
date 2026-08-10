import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionFixtures } from '@termspace/contracts'

import { fixtureSource } from './fixture-source.ts'

test('the fixture source answers every method of the seam with an ok envelope', async () => {
  const responses = [
    await fixtureSource.health(),
    await fixtureSource.listProjects(),
    await fixtureSource.listSessions(),
  ]
  for (const response of responses) {
    assert.equal(response.ok, true)
  }
})

test('the fixture source hands out a copy, not the shared fixture array', async () => {
  const first = await fixtureSource.listSessions()
  assert.equal(first.ok, true)
  if (!first.ok) {
    return
  }
  first.data.pop()
  assert.equal(sessionFixtures.length, 3)

  const second = await fixtureSource.listSessions()
  assert.equal(second.ok, true)
  if (!second.ok) {
    return
  }
  assert.equal(second.data.length, 3)
})

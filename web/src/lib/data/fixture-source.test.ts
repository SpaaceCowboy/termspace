import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sessionFixture, sessionFixtures } from '@termspace/contracts'

import { fixtureSource } from './fixture-source.ts'

test('the fixture source answers every method of the seam with an ok envelope', async () => {
  const responses = [
    await fixtureSource.health(),
    await fixtureSource.listProjects(),
    await fixtureSource.listSessions(),
    await fixtureSource.layout(),
  ]
  for (const response of responses) {
    assert.equal(response.ok, true)
  }
})

test('a layout saved against the fixture source comes back normalized', async () => {
  const saved = await fixtureSource.saveLayout({
    mode: 'grid',
    slots: [sessionFixture.id, sessionFixture.id, 'ses_nosuchsess001'],
    focusedSlot: 6,
  })
  assert.equal(saved.ok, true)
  if (!saved.ok) {
    return
  }
  assert.deepEqual(saved.data.slots.slice(0, 3), [sessionFixture.id, null, null])
  assert.equal(saved.data.focusedSlot, 0, 'focus follows the one live slot')

  const reread = await fixtureSource.layout()
  assert.equal(reread.ok, true)
  if (reread.ok) {
    assert.deepEqual(reread.data, saved.data)
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

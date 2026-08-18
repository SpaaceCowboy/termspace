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
    await fixtureSource.operations(),
    await fixtureSource.favorites(),
  ]
  for (const response of responses) {
    assert.equal(response.ok, true)
  }
})

test('the fixture source persists and filters favorites', async () => {
  const saved = await fixtureSource.saveFavorites({
    projectIds: ['prj_apirefac0002', 'missing'],
    sessionIds: ['ses_apirefac0002', 'missing'],
  })
  assert.deepEqual(saved, {
    ok: true,
    data: { projectIds: ['prj_apirefac0002'], sessionIds: ['ses_apirefac0002'] },
  })
  assert.deepEqual(await fixtureSource.favorites(), saved)
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

test('the fixture source creates an isolated worktree session and exposes its diff', async () => {
  const created = await fixtureSource.createSession({
    projectId: 'prj_portalui0001',
    name: 'Parallel',
    agent: 'codex',
    worktree: true,
    worktreeBranch: 'ts/parallel-fixture',
  })
  assert.equal(created.ok, true)
  if (!created.ok) {
    return
  }
  assert.equal(created.data.worktreeBranch, 'ts/parallel-fixture')
  assert.match(created.data.cwd, /\.termspace-worktrees/)
  assert.equal(created.data.hasCwdConflict, false)

  const diff = await fixtureSource.sessionDiff(created.data.id)
  assert.equal(diff.ok, true)
  if (diff.ok) {
    assert.equal(diff.data.sessionId, created.data.id)
  }

  await fixtureSource.deleteSession(created.data.id, { force: true })
})

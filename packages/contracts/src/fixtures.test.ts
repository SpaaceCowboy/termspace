import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AGENT_KINDS } from './core.js'
import {
  agentKindFixtures,
  binaryOutputFixture,
  clientFrameFixtures,
  createSessionInputFixture,
  createWorktreeSessionInputFixture,
  diffResultFixture,
  layoutFixture,
  layoutModeFixtures,
  favoritesFixture,
  operationalEventKindFixtures,
  operationalEventLevelFixtures,
  operationalHealthFixtures,
  operationalStatusFixture,
  projectFixtures,
  serverFrameFixtures,
  sessionFixture,
  sessionFixtures,
  sessionStateFixtures,
  visibilityLevelFixtures,
} from './fixtures.js'
import { LAYOUT_MODES, normalizeLayout } from './layout.js'
import {
  OPERATIONAL_EVENT_KINDS,
  OPERATIONAL_EVENT_LEVELS,
  OPERATIONAL_HEALTH_STATES,
} from './operations.js'
import { BINARY_SID_BYTES, SESSION_STATES, VISIBILITY_LEVELS } from './transport.js'

const CLIENT_FRAME_KINDS = ['sub', 'unsub', 'in', 'resize', 'vis', 'ping'] as const
const SERVER_FRAME_KINDS = [
  'restore',
  'status',
  'title',
  'exit',
  'truncated',
  'error',
  'pong',
] as const

test('every client frame variant has a fixture tagged with its own kind', () => {
  assert.deepEqual(Object.keys(clientFrameFixtures).sort(), [...CLIENT_FRAME_KINDS].sort())
  for (const kind of CLIENT_FRAME_KINDS) {
    assert.equal(clientFrameFixtures[kind].t, kind)
  }
})

test('every server frame variant has a fixture tagged with its own kind', () => {
  assert.deepEqual(Object.keys(serverFrameFixtures).sort(), [...SERVER_FRAME_KINDS].sort())
  for (const kind of SERVER_FRAME_KINDS) {
    assert.equal(serverFrameFixtures[kind].t, kind)
  }
})

test('every member of a string union has a fixture', () => {
  assert.deepEqual(Object.keys(sessionStateFixtures).sort(), [...SESSION_STATES].sort())
  assert.deepEqual(Object.keys(visibilityLevelFixtures).sort(), [...VISIBILITY_LEVELS].sort())
  assert.deepEqual(Object.keys(agentKindFixtures).sort(), [...AGENT_KINDS].sort())
  assert.deepEqual(Object.keys(layoutModeFixtures).sort(), [...LAYOUT_MODES].sort())
  assert.deepEqual(
    Object.keys(operationalHealthFixtures).sort(),
    [...OPERATIONAL_HEALTH_STATES].sort(),
  )
  assert.deepEqual(
    Object.keys(operationalEventKindFixtures).sort(),
    [...OPERATIONAL_EVENT_KINDS].sort(),
  )
  assert.deepEqual(
    Object.keys(operationalEventLevelFixtures).sort(),
    [...OPERATIONAL_EVENT_LEVELS].sort(),
  )
})

test('the layout fixture is itself a normal layout of real sessions', () => {
  const { updatedAt: _ignored, ...input } = layoutFixture
  assert.deepEqual(normalizeLayout(input), input)
  const sessionIds = new Set(sessionFixtures.map((session) => session.id))
  for (const sid of layoutFixture.slots) {
    assert.ok(sid === null || sessionIds.has(sid), `layout slot holds a ghost session: ${sid}`)
  }
})

test('session fixtures reference a project fixture', () => {
  const projectIds = new Set(projectFixtures.map((project) => project.id))
  for (const session of sessionFixtures) {
    assert.ok(projectIds.has(session.projectId), `orphan session ${session.id}`)
  }
})

test('favorites and operational status fixtures only reference known variants and entities', () => {
  const projectIds = new Set(projectFixtures.map(({ id }) => id))
  const sessionIds = new Set(sessionFixtures.map(({ id }) => id))
  assert.ok(favoritesFixture.projectIds.every((id) => projectIds.has(id)))
  assert.ok(favoritesFixture.sessionIds.every((id) => sessionIds.has(id)))
  assert.equal(operationalStatusFixture.tmux.persistedSessions, sessionFixtures.length)
  for (const event of operationalStatusFixture.recentEvents) {
    assert.ok(OPERATIONAL_EVENT_KINDS.includes(event.kind))
    assert.ok(OPERATIONAL_EVENT_LEVELS.includes(event.level))
  }
})

test('every session id is exactly one binary frame prefix wide, in ASCII', () => {
  for (const session of sessionFixtures) {
    assert.equal(session.id.length, BINARY_SID_BYTES, `bad session id width: ${session.id}`)
    assert.match(session.id, /^[\x20-\x7e]+$/, `session id is not ASCII: ${session.id}`)
  }
})

test('the binary output fixture puts the session id in the first 16 bytes', () => {
  const frame = binaryOutputFixture(sessionFixture.id)
  assert.ok(frame.length > BINARY_SID_BYTES)
  const sid = new TextDecoder().decode(frame.subarray(0, BINARY_SID_BYTES))
  assert.equal(sid, sessionFixture.id)
})

test('the binary output fixture refuses a session id that is not 16 bytes', () => {
  assert.throws(() => binaryOutputFixture('ses_short'), /exactly 16 ASCII bytes/)
})

test('the create-session fixture omits cwd rather than sending undefined', () => {
  assert.equal('cwd' in createSessionInputFixture, false)
})

test('the worktree create fixture carries a branch and no caller-selected cwd', () => {
  assert.equal(createWorktreeSessionInputFixture.worktree, true)
  assert.equal('cwd' in createWorktreeSessionInputFixture, false)
  assert.match(createWorktreeSessionInputFixture.worktreeBranch, /^ts\//)
})

test('the diff fixture refers to a real session and distinguishes untracked files', () => {
  assert.ok(sessionFixtures.some(({ id }) => id === diffResultFixture.sessionId))
  assert.equal(diffResultFixture.files.at(-1)?.status, 'untracked')
  assert.equal(diffResultFixture.files.at(-1)?.additions, null)
})

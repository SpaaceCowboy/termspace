import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AGENT_KINDS } from './core.js'
import {
  agentKindFixtures,
  binaryOutputFixture,
  clientFrameFixtures,
  createSessionInputFixture,
  projectFixtures,
  serverFrameFixtures,
  sessionFixture,
  sessionFixtures,
  sessionStateFixtures,
  visibilityLevelFixtures,
} from './fixtures.js'
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
})

test('session fixtures reference a project fixture', () => {
  const projectIds = new Set(projectFixtures.map((project) => project.id))
  for (const session of sessionFixtures) {
    assert.ok(projectIds.has(session.projectId), `orphan session ${session.id}`)
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

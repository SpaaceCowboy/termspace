import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Project, Session } from '@termspace/contracts'
import { projectFixtures, sessionFixtures } from '@termspace/contracts'

import { ORPHAN_GROUP_ID, groupSessionsByProject } from './group-sessions.ts'

test('nests every session under its project', () => {
  const groups = groupSessionsByProject(projectFixtures, sessionFixtures)

  assert.deepEqual(
    groups.map((group) => [group.id, group.sessions.length]),
    [
      [projectFixtures[1]?.id, 1],
      [projectFixtures[0]?.id, 2],
    ],
  )
  assert.equal(
    groups.every((group) =>
      group.sessions.every((session) => session.projectId === group.id),
    ),
    true,
  )
})

test('keeps a project with no sessions, because that is where you start one', () => {
  const groups = groupSessionsByProject(projectFixtures, [])
  assert.equal(groups.length, projectFixtures.length)
  assert.equal(
    groups.every((group) => group.sessions.length === 0),
    true,
  )
})

test('surfaces a session whose project is missing instead of dropping it', () => {
  const orphan: Session = { ...sessionFixtures[0]!, id: 'ses_orphan00001', projectId: 'gone' }
  const groups = groupSessionsByProject(projectFixtures, [orphan])

  const orphanGroup = groups.find((group) => group.id === ORPHAN_GROUP_ID)
  assert.notEqual(orphanGroup, undefined)
  assert.deepEqual(orphanGroup?.sessions, [orphan])
})

test('adds no orphan group when every session has a project', () => {
  const groups = groupSessionsByProject(projectFixtures, sessionFixtures)
  assert.equal(
    groups.some((group) => group.id === ORPHAN_GROUP_ID),
    false,
  )
})

test('returns nothing to render when there are neither projects nor sessions', () => {
  assert.deepEqual(groupSessionsByProject([], []), [])
})

test('groups by project id, not by array position', () => {
  const projects: readonly Project[] = [...projectFixtures].reverse()
  const groups = groupSessionsByProject(projects, sessionFixtures)
  for (const group of groups) {
    for (const session of group.sessions) {
      assert.equal(session.projectId, group.id)
    }
  }
})

test('sorts needs-you sessions and their projects first, ahead of favorites', () => {
  const groups = groupSessionsByProject(projectFixtures, sessionFixtures, {
    projectIds: [projectFixtures[0]!.id],
    sessionIds: [sessionFixtures[2]!.id],
  })
  assert.equal(groups[0]?.id, projectFixtures[1]?.id, 'attention outranks a pinned project')
  assert.equal(groups[1]?.sessions[0]?.id, sessionFixtures[2]?.id, 'pin leads ordinary sessions')
})

test('a pinned session surfaces its project when nothing needs attention', () => {
  const quiet = sessionFixtures.map((session) => ({ ...session, state: 'idle' as const }))
  const groups = groupSessionsByProject(projectFixtures, quiet, {
    projectIds: [],
    sessionIds: [sessionFixtures[1]!.id],
  })
  assert.equal(groups[0]?.id, sessionFixtures[1]!.projectId)
})

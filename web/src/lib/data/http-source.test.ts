import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  appConfigFixture,
  diffResultFixture,
  projectFixtures,
  sessionFixtures,
} from '@termspace/contracts'

import {
  AppConfigSchema,
  DiffResultSchema,
  ProjectSchema,
  SessionSchema,
} from './http-source.ts'

/**
 * The response schemas are the seam where a client-side mistake looks exactly
 * like a server bug: a schema that is wrong in either direction empties the
 * sidebar and reports "the server sent a response that does not match the
 * contract", which points at the wrong half of the system.
 *
 * Parsing the shared fixtures is what keeps the two honest, since the fixtures
 * are typed as the real contract.
 */
describe('response schemas accept the shared fixtures', () => {
  it('parses every project fixture', () => {
    for (const project of projectFixtures) {
      const result = ProjectSchema.safeParse(project)
      assert.equal(result.success, true, JSON.stringify(result.error?.issues))
    }
  })

  it('parses a project that overrides no agent command', () => {
    // zod 4 makes a record keyed by an enum exhaustive, so this — the normal
    // case for a project — was rejected and took the whole list down with it.
    const result = ProjectSchema.safeParse({
      ...projectFixtures[0],
      agentCommands: {},
    })
    assert.equal(result.success, true, JSON.stringify(result.error?.issues))
  })

  it('parses a project that overrides exactly one agent command', () => {
    const result = ProjectSchema.safeParse({
      ...projectFixtures[0],
      agentCommands: { codex: ['codex', '--yolo'] },
    })
    assert.equal(result.success, true, JSON.stringify(result.error?.issues))
  })

  it('still rejects a project missing a required field', () => {
    const { path: _path, ...withoutPath } = projectFixtures[0]!
    assert.equal(ProjectSchema.safeParse(withoutPath).success, false)
  })

  it('rejects an agent command that is not an array of strings', () => {
    for (const agentCommands of [{ claude: 'claude' }, { claude: [1] }]) {
      const result = ProjectSchema.safeParse({ ...projectFixtures[0], agentCommands })
      assert.equal(result.success, false, JSON.stringify(agentCommands))
    }
  })

  it('parses the config fixture, whose defaults cover every agent kind', () => {
    const result = AppConfigSchema.safeParse(appConfigFixture)
    assert.equal(result.success, true, JSON.stringify(result.error?.issues))
  })

  it('parses sessions with derived cwd conflicts and worktree branches', () => {
    for (const session of sessionFixtures) {
      const result = SessionSchema.safeParse(session)
      assert.equal(result.success, true, JSON.stringify(result.error?.issues))
    }
    const { hasCwdConflict: _flag, ...oldShape } = sessionFixtures[0]!
    assert.equal(SessionSchema.safeParse(oldShape).success, false)
  })

  it('parses the bounded diff fixture', () => {
    const result = DiffResultSchema.safeParse(diffResultFixture)
    assert.equal(result.success, true, JSON.stringify(result.error?.issues))
  })
})

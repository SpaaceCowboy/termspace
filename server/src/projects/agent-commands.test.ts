import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { AGENT_COMMAND_MAX_ARGS } from '@termspace/contracts'

import {
  parseAgentCommandOverrides,
  parseAgentCommands,
  resolveAgentCommand,
  serializeAgentCommands,
} from './agent-commands.js'

describe('agent command overrides', () => {
  it('falls back to the default for an agent the project does not override', () => {
    assert.deepEqual(resolveAgentCommand('claude', {}), ['claude'])
    assert.deepEqual(resolveAgentCommand('codex', { claude: ['claude', '-r'] }), ['codex'])
  })

  it('treats an empty override as a real value, not as unset', () => {
    // `?? default` would undo this if the override were stored as null.
    assert.deepEqual(resolveAgentCommand('claude', { claude: [] }), [])
  })

  it('defaults shell to no command so tmux starts the login shell', () => {
    assert.deepEqual(resolveAgentCommand('shell', {}), [])
  })

  it('round-trips through storage', () => {
    const overrides = { claude: ['claude', '--model', 'opus'], shell: ['fish'] }
    assert.deepEqual(parseAgentCommands(serializeAgentCommands(overrides)), overrides)
  })

  it('reads an unusable stored value as no override rather than throwing', () => {
    // A row from an older server, or one edited by hand, must not take the whole
    // project list down — every read of it goes through here.
    for (const raw of ['', 'not json', '[]', '{"claude":"claude"}', '{"claude":[""]}']) {
      assert.deepEqual(parseAgentCommands(raw), {}, raw)
    }
  })

  it('rejects an argument containing a NUL', () => {
    // execve truncates at a NUL, so the stored command and the executed command
    // would differ — the one thing this validation exists to prevent.
    assert.throws(() => parseAgentCommandOverrides({ claude: ['claude\0--evil'] }))
  })

  it('rejects an empty argument and an over-long argv', () => {
    assert.throws(() => parseAgentCommandOverrides({ claude: [''] }))
    assert.throws(() =>
      parseAgentCommandOverrides({
        claude: Array.from({ length: AGENT_COMMAND_MAX_ARGS + 1 }, () => 'x'),
      }),
    )
  })

  it('rejects an unknown agent kind', () => {
    assert.throws(() => parseAgentCommandOverrides({ gemini: ['gemini'] }))
  })

  it('keeps an absent key absent rather than explicitly undefined', () => {
    // `exactOptionalPropertyTypes` makes these different types, and the
    // difference reaches the wire as a `"claude": null` that nothing expects.
    const overrides = parseAgentCommandOverrides({ codex: ['codex'] })
    assert.equal(Object.hasOwn(overrides, 'claude'), false)
    assert.equal(JSON.stringify(overrides), '{"codex":["codex"]}')
  })
})

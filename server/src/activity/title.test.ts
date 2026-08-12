import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { deriveTitle, TITLE_MAX_LENGTH } from './title.js'

const HOST = { hostname: 'Bebop' }

describe('deriveTitle', () => {
  it('takes the task summary a real Claude Code pane published', () => {
    // Both captured from a live `claude` in tmux: ◑ while working, ✳ at rest,
    // around the same task.
    assert.equal(
      deriveTitle('claude', '◑ Count markdown files in docs', HOST),
      'Count markdown files in docs',
    )
    assert.equal(
      deriveTitle('claude', '✳ Count markdown files in docs', HOST),
      'Count markdown files in docs',
    )
  })

  it('gives the same title either side of the liveness glyph', () => {
    // The whole reason the decoration is stripped: otherwise a session emits a
    // title frame on every turn boundary while the task never changed.
    assert.equal(
      deriveTitle('claude', '◑ Refactor the grid layout', HOST),
      deriveTitle('claude', '✳ Refactor the grid layout', HOST),
    )
  })

  it('rejects the hostname tmux uses as its default pane title', () => {
    assert.equal(deriveTitle('shell', 'Bebop', HOST), null)
  })

  it('rejects the agent naming itself rather than its work', () => {
    assert.equal(deriveTitle('claude', '✳ Claude Code', HOST), null)
    assert.equal(deriveTitle('claude', 'claude', HOST), null)
    assert.equal(deriveTitle('codex', 'Codex CLI', HOST), null)
  })

  it('keeps an agent name that is only the start of a real title', () => {
    assert.equal(
      deriveTitle('claude', 'Claude Code cannot start', HOST),
      'Claude Code cannot start',
    )
  })

  it('rejects the user@host:path title a stock shell sets', () => {
    assert.equal(deriveTitle('shell', 'spacecowboy@Bebop:~/termspace', HOST), null)
    assert.equal(deriveTitle('shell', 'root@web-01:/srv', HOST), null)
  })

  it('keeps a title a shell was given deliberately', () => {
    assert.equal(deriveTitle('shell', 'tailing the gateway log', HOST), 'tailing the gateway log')
  })

  it('returns null rather than empty, so a good title is never blanked', () => {
    assert.equal(deriveTitle('claude', '', HOST), null)
    assert.equal(deriveTitle('claude', '   ', HOST), null)
    assert.equal(deriveTitle('claude', '✳', HOST), null)
  })

  it('collapses the padding a redrawn TUI leaves in the title', () => {
    assert.equal(
      deriveTitle('claude', '◑  Count   markdown\tfiles   ', HOST),
      'Count markdown files',
    )
  })

  it('truncates a long title to something that fits a tab', () => {
    const derived = deriveTitle('claude', `◑ ${'a'.repeat(200)}`, HOST)
    assert.equal(derived?.length, TITLE_MAX_LENGTH)
    assert.equal(derived?.endsWith('…'), true)
  })

  it('leaves a title exactly at the limit alone', () => {
    const exact = 'b'.repeat(TITLE_MAX_LENGTH)
    assert.equal(deriveTitle('claude', exact, HOST), exact)
  })
})

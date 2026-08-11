import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CommandTextError,
  formatCommand,
  parseCommandText,
} from './agent-command-text.ts'

describe('parseCommandText', () => {
  it('splits on whitespace and collapses runs of it', () => {
    assert.deepEqual(parseCommandText('claude   --model  opus'), [
      'claude',
      '--model',
      'opus',
    ])
    assert.deepEqual(parseCommandText('  '), [])
    assert.deepEqual(parseCommandText(''), [])
  })

  it('keeps a quoted argument in one piece', () => {
    assert.deepEqual(parseCommandText('claude --prompt "hello world"'), [
      'claude',
      '--prompt',
      'hello world',
    ])
    assert.deepEqual(parseCommandText("claude --prompt 'hello world'"), [
      'claude',
      '--prompt',
      'hello world',
    ])
  })

  it('treats an explicitly empty argument as an argument', () => {
    assert.deepEqual(parseCommandText("claude ''"), ['claude', ''])
  })

  it('lets a backslash escape a space or a quote', () => {
    assert.deepEqual(parseCommandText('claude a\\ b'), ['claude', 'a b'])
    assert.deepEqual(parseCommandText('claude \\"quoted\\"'), ['claude', '"quoted"'])
  })

  it('refuses an unclosed quote rather than guessing where it ended', () => {
    assert.throws(() => parseCommandText('claude "unclosed'), CommandTextError)
    assert.throws(() => parseCommandText('claude trailing\\'), CommandTextError)
  })

  it('does not treat shell operators as special, because nothing expands them', () => {
    // The argv is exec'd directly. These are ordinary characters, and pretending
    // otherwise would only stop someone passing a literal one.
    assert.deepEqual(parseCommandText('claude $HOME && rm'), [
      'claude',
      '$HOME',
      '&&',
      'rm',
    ])
  })
})

describe('formatCommand', () => {
  it('leaves ordinary arguments unquoted', () => {
    assert.equal(formatCommand(['claude', '--model', 'opus']), 'claude --model opus')
  })

  it('round-trips anything it quotes', () => {
    for (const argv of [
      ['claude', 'hello world'],
      ['claude', ''],
      ['claude', "it's"],
      ['claude', 'a"b'],
      ['claude', 'back\\slash'],
      ['claude', '  '],
    ]) {
      assert.deepEqual(parseCommandText(formatCommand(argv)), argv, formatCommand(argv))
    }
  })
})

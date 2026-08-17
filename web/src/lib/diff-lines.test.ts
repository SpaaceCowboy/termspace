import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyDiffLine, parseDiffLines } from './diff-lines.ts'

describe('diff line presentation', () => {
  it('distinguishes file, metadata, hunk, and content lines', () => {
    assert.equal(classifyDiffLine('diff --git a/a.ts b/a.ts'), 'file-header')
    assert.equal(classifyDiffLine('--- a/a.ts'), 'metadata')
    assert.equal(classifyDiffLine('+++ b/a.ts'), 'metadata')
    assert.equal(classifyDiffLine('@@ -1 +1 @@'), 'hunk')
    assert.equal(classifyDiffLine('+added'), 'addition')
    assert.equal(classifyDiffLine('-removed'), 'deletion')
    assert.equal(classifyDiffLine(' unchanged'), 'context')
  })

  it('preserves line numbers and an empty final line', () => {
    assert.deepEqual(parseDiffLines('+one\n-two\n'), [
      { kind: 'addition', number: 1, text: '+one' },
      { kind: 'deletion', number: 2, text: '-two' },
      { kind: 'context', number: 3, text: '' },
    ])
    assert.deepEqual(parseDiffLines(''), [])
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { sessionFixture } from '@termspace/contracts'

import type { BoundedCommandResult } from '../tmux/process-runner.js'
import { DIFF_MAX_FILES, GitDiffReader } from './diff-reader.js'

class FakeRunner {
  readonly results: BoundedCommandResult[] = []

  async runBounded(): Promise<BoundedCommandResult> {
    return this.results.shift() ?? { stdout: '', stderr: '', truncated: false }
  }
}

describe('GitDiffReader', () => {
  it('combines tracked stats, renames, binary files, and untracked paths', async () => {
    const runner = new FakeRunner()
    runner.results.push(
      {
        stdout: 'M\0src/app.ts\0R100\0old.ts\0new.ts\0A\0image.png\0',
        stderr: '', truncated: false,
      },
      {
        stdout: '8\t2\tsrc/app.ts\0' + '1\t0\t\0old.ts\0new.ts\0' + '-\t-\timage.png\0',
        stderr: '', truncated: false,
      },
      { stdout: '?? notes.txt\0 M src/app.ts\0', stderr: '', truncated: false },
      { stdout: 'diff --git a/src/app.ts b/src/app.ts\n', stderr: '', truncated: false },
    )

    const result = await new GitDiffReader(runner).read(sessionFixture, 'main')

    assert.deepEqual(result.files, [
      {
        path: 'src/app.ts', previousPath: null, status: 'modified',
        additions: 8, deletions: 2, binary: false,
      },
      {
        path: 'new.ts', previousPath: 'old.ts', status: 'renamed',
        additions: 1, deletions: 0, binary: false,
      },
      {
        path: 'image.png', previousPath: null, status: 'added',
        additions: null, deletions: null, binary: true,
      },
      {
        path: 'notes.txt', previousPath: null, status: 'untracked',
        additions: null, deletions: null, binary: false,
      },
    ])
    assert.equal(result.truncated, false)
  })

  it('marks any bounded output or file-count limit as truncated', async () => {
    const runner = new FakeRunner()
    const names = Array.from(
      { length: DIFF_MAX_FILES + 1 },
      (_, index) => `M\0file-${String(index)}\0`,
    ).join('')
    runner.results.push(
      { stdout: names, stderr: '', truncated: false },
      { stdout: '', stderr: '', truncated: false },
      { stdout: '', stderr: '', truncated: false },
      { stdout: 'partial', stderr: '', truncated: true },
    )

    const result = await new GitDiffReader(runner).read(sessionFixture, 'main')

    assert.equal(result.files.length, DIFF_MAX_FILES)
    assert.equal(result.truncated, true)
  })

  it('drops an incomplete final NUL record instead of inventing a path', async () => {
    const runner = new FakeRunner()
    runner.results.push(
      { stdout: 'M\0complete.ts\0M\0cut-off', stderr: '', truncated: true },
      { stdout: '1\t1\tcomplete.ts\0', stderr: '', truncated: false },
      { stdout: '', stderr: '', truncated: false },
      { stdout: '', stderr: '', truncated: false },
    )

    const result = await new GitDiffReader(runner).read(sessionFixture, 'main')

    assert.deepEqual(result.files.map(({ path }) => path), ['complete.ts'])
    assert.equal(result.truncated, true)
  })
})

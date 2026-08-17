import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CommandExitError, ExecFileProcessRunner } from './process-runner.js'

describe('ExecFileProcessRunner.runBounded', () => {
  it('drains a command while retaining only the configured stdout bytes', async () => {
    const runner = new ExecFileProcessRunner()
    const result = await runner.runBounded(
      'printf',
      ['abcdefghij'],
      4,
    )

    assert.deepEqual(result, { stdout: 'abcd', stderr: '', truncated: true })
  })

  it('returns complete output without a truncation marker when it fits', async () => {
    const runner = new ExecFileProcessRunner()
    const result = await runner.runBounded(
      'git',
      ['--version'],
      64,
    )

    assert.match(result.stdout, /^git version /)
    assert.equal(result.stderr, '')
    assert.equal(result.truncated, false)
  })

  it('rejects a non-zero process with bounded diagnostic output', async () => {
    const runner = new ExecFileProcessRunner()

    await assert.rejects(
      runner.runBounded(
        'git',
        ['-C', '/definitely/not/a/termspace/repository', 'status'],
        1_024,
      ),
      (error: unknown) => {
        assert.ok(error instanceof CommandExitError)
        assert.notEqual(error.code, 0)
        assert.match(error.stderr, /cannot change to/)
        return true
      },
    )
  })
})

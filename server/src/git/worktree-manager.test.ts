import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { projectFixture } from '@termspace/contracts'

import type { CommandResult, ProcessRunner } from '../tmux/process-runner.js'
import {
  WorktreeConflictError,
  WorktreeDirtyError,
  WorktreeManager,
} from './worktree-manager.js'

const SID = 'ses_portalui0001'

class FakeRunner implements ProcessRunner {
  readonly calls: { command: string; arguments_: readonly string[] }[] = []
  readonly results: (CommandResult | Error | { code: number })[] = []

  async run(command: string, arguments_: readonly string[]): Promise<CommandResult> {
    this.calls.push({ command, arguments_ })
    const result = this.results.shift()
    if (result instanceof Error || (result !== undefined && 'code' in result)) {
      throw result
    }
    return result ?? { stdout: '', stderr: '' }
  }
}

function setup() {
  const runner = new FakeRunner()
  const made: string[] = []
  const removed: string[] = []
  const manager = new WorktreeManager(runner, '/srv/projects', {
    pathExists: async () => false,
    makeDirectory: async (path) => { made.push(path) },
    removeDirectory: async (path) => { removed.push(path) },
    realPath: async (path) => path,
  })
  return { made, manager, removed, runner }
}

describe('WorktreeManager', () => {
  it('creates a new branch in a generated directory outside the project tree', async () => {
    const { made, manager, runner } = setup()
    runner.results.push(
      { stdout: 'true\n', stderr: '' },
      { stdout: '', stderr: '' },
      { code: 1 },
      { stdout: '', stderr: '' },
    )

    const cwd = await manager.create(projectFixture, SID, 'ts/portal')

    assert.equal(cwd, `/srv/projects/.termspace-worktrees/${SID}`)
    assert.deepEqual(made, ['/srv/projects/.termspace-worktrees'])
    assert.deepEqual(runner.calls.at(-1), {
      command: 'git',
      arguments_: [
        '-C', projectFixture.path,
        'worktree', 'add', '-b', 'ts/portal', cwd, projectFixture.defaultBranch,
      ],
    })
  })

  it('refuses an existing branch before making a directory', async () => {
    const { made, manager, runner } = setup()
    runner.results.push(
      { stdout: 'true\n', stderr: '' },
      { stdout: '', stderr: '' },
      { stdout: '', stderr: '' },
    )

    await assert.rejects(manager.create(projectFixture, SID, 'ts/existing'), WorktreeConflictError)
    assert.deepEqual(made, [])
  })

  it('refuses dirty removal unless force is explicit', async () => {
    const { manager, runner } = setup()
    runner.results.push({ stdout: '?? untracked.txt\n', stderr: '' })

    await assert.rejects(
      manager.remove(projectFixture.path, '/srv/projects/.termspace-worktrees/x', false),
      WorktreeDirtyError,
    )
    assert.equal(runner.calls.length, 1, 'git worktree remove was never reached')
  })

  it('force removal skips the dirty check and preserves the branch', async () => {
    const { manager, runner } = setup()

    await manager.remove(projectFixture.path, '/srv/projects/.termspace-worktrees/x', true)

    assert.deepEqual(runner.calls, [{
      command: 'git',
      arguments_: [
        '-C', projectFixture.path,
        'worktree', 'remove', '--force',
        '/srv/projects/.termspace-worktrees/x',
      ],
    }])
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { CommandResult, ProcessRunner } from './process-runner.js'
import { TmuxClient } from './tmux-client.js'

const SID = 'ses_portalui0001'

class RecordingRunner implements ProcessRunner {
  readonly calls: { command: string; arguments_: readonly string[] }[] = []
  readonly #results: CommandResult[]

  constructor(results: CommandResult[] = []) {
    this.#results = results
  }

  async run(
    command: string,
    arguments_: readonly string[],
  ): Promise<CommandResult> {
    this.calls.push({ command, arguments_ })
    return this.#results.shift() ?? { stderr: '', stdout: '' }
  }
}

describe('TmuxClient', () => {
  it('creates a detached, fixed-size session in the requested cwd', async () => {
    const runner = new RecordingRunner()
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    await tmux.createDetached(SID, '/srv/project')

    assert.deepEqual(runner.calls, [
      {
        command: 'tmux',
        arguments_: [
          '-f',
          '/config/tmux.conf',
          'new-session',
          '-d',
          '-s',
          `ts_${SID}`,
          '-c',
          '/srv/project',
          '-x',
          '200',
          '-y',
          '50',
        ],
      },
    ])
  })

  it('kills only the named Termspace session', async () => {
    const runner = new RecordingRunner()
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    await tmux.kill(SID)

    assert.deepEqual(runner.calls[0], {
      command: 'tmux',
      arguments_: ['kill-session', '-t', `ts_${SID}`],
    })
  })

  it('captures ANSI scrollback from tmux', async () => {
    const runner = new RecordingRunner([
      { stderr: '', stdout: '\u001b[32mready\u001b[0m\n' },
    ])
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    assert.equal(
      await tmux.capture(SID),
      '\u001b[32mready\u001b[0m\n',
    )
    assert.deepEqual(runner.calls[0], {
      command: 'tmux',
      arguments_: [
        'capture-pane',
        '-e',
        '-p',
        '-S',
        '-2000',
        '-t',
        `ts_${SID}`,
      ],
    })
  })

  it('provides attach arguments without retaining a process handle', () => {
    const tmux = new TmuxClient(new RecordingRunner(), '/config/tmux.conf')
    assert.deepEqual(tmux.attachCommand(SID), {
      command: 'tmux',
      arguments_: ['attach-session', '-t', `ts_${SID}`],
    })
  })
})

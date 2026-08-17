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

class FailingRunner implements ProcessRunner {
  constructor(readonly error: unknown) {}

  async run(): Promise<CommandResult> {
    throw this.error
  }
}

class KillFailureRunner implements ProcessRunner {
  calls = 0

  constructor(readonly code: number) {}

  async run(): Promise<CommandResult> {
    this.calls += 1
    if (this.calls === 1) {
      return { stderr: '', stdout: `ts_${SID}\n` }
    }
    throw { code: this.code }
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

  it('passes a launch command through as separate argv elements', async () => {
    const runner = new RecordingRunner()
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    await tmux.createDetached(SID, '/srv/project', ['claude', '--model', 'opus'])

    // Separate elements, not one string: tmux execs this directly, so a joined
    // string would be looked up as a binary with spaces in its name.
    assert.deepEqual(runner.calls[0]?.arguments_.slice(-3), ['claude', '--model', 'opus'])
  })

  it('passes no command at all when the argv is empty', async () => {
    const runner = new RecordingRunner()
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    await tmux.createDetached(SID, '/srv/project', [])

    assert.equal(runner.calls[0]?.arguments_.at(-1), '50', 'the last argument is still -y 50')
  })

  it('launches each production command in its own memory-limited systemd scope', async () => {
    const runner = new RecordingRunner()
    const tmux = new TmuxClient(runner, {
      configPath: '/config/tmux.conf',
      socketName: 'termspace',
      sessionScope: {
        memoryMaxBytes: 536_870_912,
        shell: '/bin/zsh',
      },
    })

    await tmux.createDetached(SID, '/srv/project', [])

    assert.deepEqual(runner.calls[0], {
      command: 'tmux',
      arguments_: [
        '-L', 'termspace',
        '-f', '/config/tmux.conf',
        'new-session', '-d', '-s', `ts_${SID}`,
        '-c', '/srv/project', '-x', '200', '-y', '50',
        '/usr/bin/systemd-run',
        '--scope',
        `--unit=termspace-session-${SID}.scope`,
        '--slice=termspace-sessions.slice',
        '--property=MemoryMax=536870912',
        '--collect', '--quiet', '--', '/bin/zsh', '-l',
      ],
    })
  })

  it('uses the user manager for scoped tests and stops a leftover scope on delete', async () => {
    const runner = new RecordingRunner([
      { stderr: '', stdout: '' },
      { stderr: '', stdout: '' },
    ])
    const tmux = new TmuxClient(runner, {
      socketName: 'termspace-test',
      sessionScope: {
        memoryMaxBytes: 536_870_912,
        shell: '/bin/bash',
        user: true,
      },
    })

    await tmux.kill(SID)

    assert.deepEqual(runner.calls, [
      {
        command: 'tmux',
        arguments_: ['-L', 'termspace-test', 'list-sessions', '-F', '#{session_name}'],
      },
      {
        command: '/usr/bin/systemctl',
        arguments_: ['--user', 'stop', `termspace-session-${SID}.scope`],
      },
    ])
  })

  it('kills only the named Termspace session', async () => {
    const runner = new RecordingRunner([
      { stderr: '', stdout: `ts_${SID}\n` },
      { stderr: '', stdout: '' },
    ])
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    await tmux.kill(SID)

    assert.deepEqual(runner.calls, [
      {
        command: 'tmux',
        arguments_: ['list-sessions', '-F', '#{session_name}'],
      },
      {
        command: 'tmux',
        arguments_: ['kill-session', '-t', `ts_${SID}`],
      },
    ])
  })

  it('treats an already absent session as successfully killed', async () => {
    const noServer = new TmuxClient(new FailingRunner({ code: 1 }))

    await noServer.kill(SID)
  })

  it('accepts a kill race but propagates an operational kill failure', async () => {
    await new TmuxClient(new KillFailureRunner(1)).kill(SID)
    await assert.rejects(new TmuxClient(new KillFailureRunner(2)).kill(SID))
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

  it('lists only valid Termspace session ids from one tmux snapshot', async () => {
    const runner = new RecordingRunner([
      {
        stderr: '',
        stdout: `ts_${SID}\nunrelated\nts_not-valid!\nts_ses_scratch00003\n`,
      },
    ])
    const tmux = new TmuxClient(runner, '/config/tmux.conf')

    assert.deepEqual([...await tmux.listSessionIds()], [SID, 'ses_scratch00003'])
    assert.deepEqual(runner.calls[0], {
      command: 'tmux',
      arguments_: ['list-sessions', '-F', '#{session_name}'],
    })
  })

  it('treats tmux status 1 as no live sessions and propagates other failures', async () => {
    const absent = new TmuxClient(new FailingRunner({ code: 1 }))
    assert.equal((await absent.listSessionIds()).size, 0)

    const broken = new TmuxClient(new FailingRunner({ code: 2 }))
    await assert.rejects(broken.listSessionIds())
  })

  it('provides attach arguments without retaining a process handle', () => {
    const tmux = new TmuxClient(new RecordingRunner(), '/config/tmux.conf')
    assert.deepEqual(tmux.attachCommand(SID), {
      command: 'tmux',
      arguments_: ['attach-session', '-t', `ts_${SID}`],
    })
  })
})

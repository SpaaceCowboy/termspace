import { fileURLToPath } from 'node:url'

import type { AgentCommand } from '@termspace/contracts'

import { parseSessionId } from '../sessions/session-id.js'
import type { ProcessRunner } from './process-runner.js'

const DEFAULT_TMUX_CONFIG_PATH = fileURLToPath(
  new URL('../../tmux.conf', import.meta.url),
)

export interface TmuxAttachCommand {
  readonly arguments_: readonly string[]
  readonly command: 'tmux'
}


export class TmuxClient {
  readonly #configPath: string
  readonly #runner: ProcessRunner

  constructor(
    runner: ProcessRunner,
    configPath: string = DEFAULT_TMUX_CONFIG_PATH,
  ) {
    this.#runner = runner
    this.#configPath = configPath
  }

  async createDetached(
    untrustedId: unknown,
    cwd: string,
    launchCommand: AgentCommand = [],
  ): Promise<void> {
    const sessionName = toTmuxSessionName(untrustedId)
    const arguments_: string[] = [
      '-f',
      this.#configPath,
      'new-session',
      '-d',
      '-s',
      sessionName,
      '-c',
      cwd,
      '-x',
      '200',
      '-y',
      '50',
    ]
    // tmux takes the command as separate argv elements and execs it directly,
    // so a flag is just another element and no shell ever sees this. An empty
    // command means tmux starts the login shell, which is what `shell` wants.
    arguments_.push(...launchCommand)
    await this.#runner.run('tmux', arguments_)
  }

  async kill(untrustedId: unknown): Promise<void> {
    await this.#runner.run('tmux', [
      'kill-session',
      '-t',
      toTmuxSessionName(untrustedId),
    ])
  }

  async capture(untrustedId: unknown): Promise<string> {
    const result = await this.#runner.run('tmux', [
      'capture-pane',
      '-e',
      '-p',
      '-S',
      '-2000',
      '-t',
      toTmuxSessionName(untrustedId),
    ])
    return result.stdout
  }

  attachCommand(untrustedId: unknown): TmuxAttachCommand {
    return {
      command: 'tmux',
      arguments_: [
        'attach-session',
        '-t',
        toTmuxSessionName(untrustedId),
      ],
    }
  }
}

function toTmuxSessionName(untrustedId: unknown): string {
  return `ts_${parseSessionId(untrustedId)}`
}

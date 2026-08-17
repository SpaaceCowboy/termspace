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
    const sessionId = parseSessionId(untrustedId)
    // Deletion is also how stale persisted rows are cleaned up. If tmux was
    // restarted, the shell exited while the gateway was down, or an operator
    // removed the project directory manually, there may be no tmux target left
    // to kill. Treat that as the desired end state, using the same real tmux
    // snapshot and status semantics as liveness reconciliation.
    if (!(await this.listSessionIds()).has(sessionId)) {
      return
    }
    try {
      await this.#runner.run('tmux', [
        'kill-session',
        '-t',
        toTmuxSessionName(sessionId),
      ])
    } catch (error) {
      // The target can disappear between the snapshot and kill command.
      if (commandExitCode(error) === 1) {
        return
      }
      throw error
    }
  }

  /**
   * One snapshot for liveness reconciliation. tmux exits with status 1 when no
   * server (and therefore no sessions) exists; that is an empty set, not an
   * operational failure. Any other failure still propagates.
   */
  async listSessionIds(): Promise<ReadonlySet<string>> {
    try {
      const result = await this.#runner.run('tmux', [
        'list-sessions',
        '-F',
        '#{session_name}',
      ])
      const ids = result.stdout
        .split('\n')
        .filter((name) => name.startsWith('ts_'))
        .map((name) => name.slice(3))
        .filter((id) => {
          try {
            parseSessionId(id)
            return true
          } catch {
            return false
          }
        })
      return new Set(ids)
    } catch (error) {
      if (commandExitCode(error) === 1) {
        return new Set()
      }
      throw error
    }
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

  /**
   * What the program in the pane last told its terminal it is doing, via OSC
   * 0/2. Read out-of-band rather than parsed out of the output stream, so it
   * works with nobody attached and costs no escape-sequence handling.
   *
   * Defaults to the hostname when nothing has set a title — `deriveTitle` is
   * what knows that means "no title", not this.
   */
  async paneTitle(untrustedId: unknown): Promise<string> {
    const result = await this.#runner.run('tmux', [
      'display-message',
      '-p',
      '-t',
      toTmuxSessionName(untrustedId),
      '#{pane_title}',
    ])
    return result.stdout.trim()
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

function commandExitCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  return typeof error.code === 'number' ? error.code : null
}

function toTmuxSessionName(untrustedId: unknown): string {
  return `ts_${parseSessionId(untrustedId)}`
}

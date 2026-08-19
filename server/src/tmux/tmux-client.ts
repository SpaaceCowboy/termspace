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

export interface SessionScopeOptions {
  readonly memoryMaxBytes: number
  readonly shell: string
  /** Test/development user manager; production deliberately uses system scope. */
  readonly user?: boolean
}

export interface TmuxClientOptions {
  readonly configPath?: string
  readonly sessionScope?: SessionScopeOptions
  readonly socketName?: string
  readonly socketPath?: string
}

export class TmuxClient {
  readonly #configPath: string
  readonly #runner: ProcessRunner
  readonly #sessionScope: SessionScopeOptions | undefined
  readonly #socketArguments: readonly string[]

  constructor(
    runner: ProcessRunner,
    configPathOrOptions: string | TmuxClientOptions = DEFAULT_TMUX_CONFIG_PATH,
  ) {
    this.#runner = runner
    if (typeof configPathOrOptions === 'string') {
      this.#configPath = configPathOrOptions
      this.#sessionScope = undefined
      this.#socketArguments = []
      return
    }
    this.#configPath = configPathOrOptions.configPath ?? DEFAULT_TMUX_CONFIG_PATH
    this.#sessionScope = configPathOrOptions.sessionScope
    this.#socketArguments = configPathOrOptions.socketPath !== undefined
      ? ['-S', configPathOrOptions.socketPath]
      : configPathOrOptions.socketName === undefined
        ? []
        : ['-L', configPathOrOptions.socketName]
  }

  async createDetached(
    untrustedId: unknown,
    cwd: string,
    launchCommand: AgentCommand = [],
  ): Promise<void> {
    const sessionName = toTmuxSessionName(untrustedId)
    const arguments_: string[] = [
      ...this.#socketArguments,
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
    arguments_.push(...this.#scopedLaunchCommand(sessionName, launchCommand))
    await this.#runner.run('tmux', arguments_)
  }

  async kill(untrustedId: unknown): Promise<void> {
    const sessionId = parseSessionId(untrustedId)
    // Deletion is also how stale persisted rows are cleaned up. If tmux was
    // restarted, the shell exited while the gateway was down, or an operator
    // removed the project directory manually, there may be no tmux target left
    // to kill. Treat that as the desired end state, using the same real tmux
    // snapshot and status semantics as liveness reconciliation.
    if ((await this.listSessionIds()).has(sessionId)) {
      try {
        await this.#runner.run('tmux', [
          ...this.#socketArguments,
          'kill-session',
          '-t',
          toTmuxSessionName(sessionId),
        ])
      } catch (error) {
        // The target can disappear between the snapshot and kill command.
        if (commandExitCode(error) !== 1) {
          throw error
        }
      }
    }
    await this.#stopSessionScope(sessionId)
  }

  async sendLiteral(untrustedId: unknown, data: string): Promise<void> {
    await this.#runner.run('tmux', [
      ...this.#socketArguments,
      'send-keys',
      '-t',
      toTmuxSessionName(untrustedId),
      '-l',
      '--',
      data,
    ])
  }

  /**
   * One snapshot for liveness reconciliation. tmux exits with status 1 when no
   * server (and therefore no sessions) exists; that is an empty set, not an
   * operational failure. Any other failure still propagates.
   */
  async listSessionIds(): Promise<ReadonlySet<string>> {
    try {
      const result = await this.#runner.run('tmux', [
        ...this.#socketArguments,
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
      ...this.#socketArguments,
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
      ...this.#socketArguments,
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
        ...this.#socketArguments,
        'attach-session',
        '-t',
        toTmuxSessionName(untrustedId),
      ],
    }
  }

  #scopedLaunchCommand(sessionName: string, launchCommand: AgentCommand): AgentCommand {
    if (this.#sessionScope === undefined) {
      return launchCommand
    }
    const command = launchCommand.length === 0
      ? [this.#sessionScope.shell, '-l']
      : launchCommand
    return [
      '/usr/bin/systemd-run',
      ...(this.#sessionScope.user === true ? ['--user'] : []),
      '--scope',
      `--unit=termspace-session-${sessionName.slice(3)}.scope`,
      '--slice=termspace-sessions.slice',
      `--property=MemoryMax=${String(this.#sessionScope.memoryMaxBytes)}`,
      '--collect',
      '--quiet',
      '--',
      ...command,
    ]
  }

  async #stopSessionScope(sessionId: string): Promise<void> {
    if (this.#sessionScope === undefined) {
      return
    }
    try {
      await this.#runner.run('/usr/bin/systemctl', [
        ...(this.#sessionScope.user === true ? ['--user'] : []),
        'stop',
        `termspace-session-${sessionId}.scope`,
      ])
    } catch (error) {
      // A collected scope is unloaded as soon as its command exits.
      if (commandExitCode(error) !== 5) {
        throw error
      }
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

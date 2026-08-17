import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface CommandResult {
  readonly stderr: string
  readonly stdout: string
}

export interface BoundedCommandResult extends CommandResult {
  readonly truncated: boolean
}

export class CommandExitError extends Error {
  readonly code: number | null
  readonly stderr: string

  constructor(command: string, code: number | null, stderr: string) {
    super(`${command} exited with ${code === null ? 'no status' : String(code)}`)
    this.code = code
    this.stderr = stderr
  }
}

export interface ProcessRunner {
  run(command: string, arguments_: readonly string[]): Promise<CommandResult>
}

export class ExecFileProcessRunner implements ProcessRunner {
  async run(command: string, arguments_: readonly string[]): Promise<CommandResult> {
    const result = await execFileAsync(command, arguments_, {
      encoding: 'utf8',
      maxBuffer: 4 * 1_024 * 1_024,
    })
    return { stderr: result.stderr, stdout: result.stdout }
  }

  /**
   * Drains the child completely while retaining at most `maxStdoutBytes`.
   * Killing a large diff at the limit would make Git leave worktree locks and
   * gives no reliable exit status; draining keeps process semantics intact.
   */
  runBounded(
    command: string,
    arguments_: readonly string[],
    maxStdoutBytes: number,
  ): Promise<BoundedCommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...arguments_], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let retained = 0
      let stderrRetained = 0
      let truncated = false

      child.stdout.on('data', (chunk: Buffer) => {
        const remaining = maxStdoutBytes - retained
        if (remaining > 0) {
          const kept = chunk.subarray(0, remaining)
          stdout.push(kept)
          retained += kept.length
        }
        if (chunk.length > remaining) {
          truncated = true
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        // Error output is diagnostic, not data. Bound it independently.
        if (stderrRetained < 64 * 1_024) {
          const kept = chunk.subarray(0, 64 * 1_024 - stderrRetained)
          stderr.push(kept)
          stderrRetained += kept.length
        }
      })
      child.once('error', reject)
      child.once('close', (code) => {
        const stderrText = Buffer.concat(stderr).toString('utf8')
        if (code !== 0) {
          reject(new CommandExitError(command, code, stderrText))
          return
        }
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: stderrText,
          truncated,
        })
      })
    })
  }
}

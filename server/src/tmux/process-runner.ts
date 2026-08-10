import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface CommandResult {
  readonly stderr: string
  readonly stdout: string
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
}

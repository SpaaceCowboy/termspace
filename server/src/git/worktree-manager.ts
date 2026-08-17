import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { Project } from '@termspace/contracts'

import {
  assertRealPathWithinRoot,
  normalizeAbsolutePath,
  type RealPath,
} from '../fs/contained-path.js'
import type { ProcessRunner } from '../tmux/process-runner.js'

export const WORKTREE_DIRECTORY = '.termspace-worktrees'

export class WorktreeInvalidRepositoryError extends Error {}
export class WorktreeConflictError extends Error {}
export class WorktreeCreateFailedError extends Error {}
export class WorktreeDirtyError extends Error {}
export class WorktreeRemoveFailedError extends Error {}

interface WorktreeManagerOptions {
  readonly makeDirectory?: (path: string) => Promise<void>
  readonly pathExists?: (path: string) => Promise<boolean>
  readonly removeDirectory?: (path: string) => Promise<void>
  readonly realPath?: RealPath
}

export class WorktreeManager {
  readonly #processes: ProcessRunner
  readonly #root: string
  readonly #projectRoot: string
  readonly #makeDirectory: (path: string) => Promise<void>
  readonly #pathExists: (path: string) => Promise<boolean>
  readonly #removeDirectory: (path: string) => Promise<void>
  readonly #realPath: RealPath | undefined

  constructor(
    processes: ProcessRunner,
    projectRoot: string,
    options: WorktreeManagerOptions = {},
  ) {
    this.#processes = processes
    this.#projectRoot = normalizeAbsolutePath(projectRoot)
    this.#root = worktreeStoragePath(this.#projectRoot)
    this.#makeDirectory = options.makeDirectory ?? makeDirectory
    this.#pathExists = options.pathExists ?? pathExists
    this.#removeDirectory = options.removeDirectory ?? removeDirectory
    this.#realPath = options.realPath
  }

  async create(
    project: Pick<Project, 'defaultBranch' | 'path'>,
    sessionId: string,
    branch: string,
  ): Promise<string> {
    const cwd = join(this.#root, sessionId)
    if (await this.#pathExists(cwd)) {
      throw new WorktreeConflictError(`Worktree path ${cwd} already exists`)
    }
    await this.#assertRepository(project.path)
    await this.#assertBranchName(project.path, branch)
    await this.#assertBranchAvailable(project.path, branch)
    await this.#makeDirectory(this.#root)
    await assertRealPathWithinRoot(this.#projectRoot, this.#root, {
      ...(this.#realPath === undefined ? {} : { realPath: this.#realPath }),
    })

    try {
      await this.#processes.run('git', [
        '-C',
        project.path,
        'worktree',
        'add',
        '-b',
        branch,
        cwd,
        project.defaultBranch,
      ])
      return cwd
    } catch (error) {
      await this.#removeDirectory(cwd).catch(() => undefined)
      // The branch did not exist before `worktree add`; if git created it and
      // then failed while checking out, it belongs to this failed operation.
      await this.#processes.run('git', [
        '-C',
        project.path,
        'branch',
        '-D',
        branch,
      ]).catch(() => undefined)
      throw new WorktreeCreateFailedError(errorMessage(error))
    }
  }

  async isDirty(cwd: string): Promise<boolean> {
    try {
      const result = await this.#processes.run('git', [
        '-C',
        cwd,
        'status',
        '--porcelain=v1',
        '--untracked-files=normal',
      ])
      return result.stdout.length > 0
    } catch (error) {
      throw new WorktreeRemoveFailedError(errorMessage(error))
    }
  }

  async remove(projectPath: string, cwd: string, force: boolean): Promise<void> {
    if (!force && await this.isDirty(cwd)) {
      throw new WorktreeDirtyError(`Worktree ${cwd} has uncommitted changes`)
    }
    try {
      await this.#processes.run('git', [
        '-C',
        projectPath,
        'worktree',
        'remove',
        ...(force ? ['--force'] : []),
        cwd,
      ])
    } catch (error) {
      throw new WorktreeRemoveFailedError(errorMessage(error))
    }
  }

  /** Roll back a worktree and the branch created with it. Never used on delete. */
  async rollback(projectPath: string, cwd: string, branch: string): Promise<void> {
    const failures: unknown[] = []
    try {
      await this.#processes.run('git', [
        '-C',
        projectPath,
        'worktree',
        'remove',
        '--force',
        cwd,
      ])
    } catch (error) {
      failures.push(error)
      await this.#removeDirectory(cwd).catch((removeError: unknown) => {
        failures.push(removeError)
      })
    }
    try {
      await this.#processes.run('git', [
        '-C',
        projectPath,
        'branch',
        '-D',
        branch,
      ])
    } catch (error) {
      failures.push(error)
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Worktree rollback failed')
    }
  }

  async #assertRepository(projectPath: string): Promise<void> {
    try {
      const result = await this.#processes.run('git', [
        '-C',
        projectPath,
        'rev-parse',
        '--is-inside-work-tree',
      ])
      if (result.stdout.trim() !== 'true') {
        throw new WorktreeInvalidRepositoryError(`${projectPath} is not a git worktree`)
      }
    } catch (error) {
      if (error instanceof WorktreeInvalidRepositoryError) {
        throw error
      }
      throw new WorktreeInvalidRepositoryError(errorMessage(error))
    }
  }

  async #assertBranchName(projectPath: string, branch: string): Promise<void> {
    try {
      await this.#processes.run('git', [
        '-C',
        projectPath,
        'check-ref-format',
        '--branch',
        branch,
      ])
    } catch (error) {
      throw new WorktreeConflictError(errorMessage(error))
    }
  }

  async #assertBranchAvailable(projectPath: string, branch: string): Promise<void> {
    try {
      await this.#processes.run('git', [
        '-C',
        projectPath,
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${branch}`,
      ])
    } catch (error) {
      if (commandExitCode(error) === 1) {
        return
      }
      throw new WorktreeCreateFailedError(errorMessage(error))
    }
    throw new WorktreeConflictError(`Branch ${branch} already exists`)
  }
}

export function worktreeStoragePath(projectRoot: string): string {
  return join(normalizeAbsolutePath(projectRoot), WORKTREE_DIRECTORY)
}

function commandExitCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  return typeof error.code === 'number' ? error.code : null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function makeDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

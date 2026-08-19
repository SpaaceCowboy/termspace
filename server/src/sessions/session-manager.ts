import { stat } from 'node:fs/promises'

import type {
  AgentCommand,
  AgentCommandOverrides,
  CreateSessionInput,
  DeleteSessionOptions,
  DiffResult,
  Session,
} from '@termspace/contracts'

import { createSessionId } from './session-id.js'
import {
  assertRealPathWithinRoot,
  assertWithinRoot,
  normalizeAbsolutePath,
  type RealPath,
} from '../fs/contained-path.js'
import { resolveAgentCommand } from '../projects/agent-commands.js'
import { WorktreeDirtyError } from '../git/worktree-manager.js'

interface SessionRepositoryPort {
  delete(sessionId: string): boolean
  find(sessionId: string): Session | null
  findProject(projectId: string): {
    readonly id: string
    readonly path: string
    readonly defaultBranch: string
    readonly agentCommands: AgentCommandOverrides
  } | null
  insert(session: Session): void
  list(): readonly Session[]
}

interface TmuxPort {
  createDetached(id: string, cwd: string, launchCommand: AgentCommand): Promise<void>
  sendLiteral(id: string, data: string): Promise<void>
  kill(id: string): Promise<void>
}

interface WorktreePort {
  create(
    project: { readonly path: string; readonly defaultBranch: string },
    sessionId: string,
    branch: string,
  ): Promise<string>
  isDirty(cwd: string): Promise<boolean>
  remove(projectPath: string, cwd: string, force: boolean): Promise<void>
  rollback(projectPath: string, cwd: string, branch: string): Promise<void>
}

interface SessionDiffPort {
  read(session: Session, baseBranch: string): Promise<DiffResult>
}

interface SessionManagerOptions {
  readonly createId?: () => string
  readonly diffs?: SessionDiffPort
  readonly isDirectory?: (path: string) => Promise<boolean>
  readonly isCommandAvailable?: (command: AgentCommand, cwd: string) => Promise<boolean>
  readonly now?: () => number
  readonly realPath?: RealPath
  readonly worktrees?: WorktreePort
}

export class SessionProjectNotFoundError extends Error {}
export class SessionDirectoryNotFoundError extends Error {}
export class SessionCwdOutsideProjectError extends Error {}
export class SessionAgentUnavailableError extends Error {}

export class SessionManager {
  readonly #createId: () => string
  readonly #diffs: SessionDiffPort | undefined
  readonly #isDirectory: (path: string) => Promise<boolean>
  readonly #isCommandAvailable: (command: AgentCommand, cwd: string) => Promise<boolean>
  readonly #now: () => number
  readonly #realPath: RealPath | undefined
  readonly #repository: SessionRepositoryPort
  readonly #tmux: TmuxPort
  readonly #worktrees: WorktreePort | undefined

  constructor(
    repository: SessionRepositoryPort,
    tmux: TmuxPort,
    options: SessionManagerOptions = {},
  ) {
    this.#repository = repository
    this.#tmux = tmux
    this.#createId = options.createId ?? createSessionId
    this.#diffs = options.diffs
    this.#isDirectory = options.isDirectory ?? isDirectory
    this.#isCommandAvailable = options.isCommandAvailable ?? (async () => true)
    this.#now = options.now ?? Date.now
    this.#realPath = options.realPath
    this.#worktrees = options.worktrees
  }

  async create(input: CreateSessionInput): Promise<Session> {
    const project = this.#repository.findProject(input.projectId)
    if (project === null) {
      throw new SessionProjectNotFoundError(`Project ${input.projectId} was not found`)
    }
    const launchCommand = resolveAgentCommand(input.agent, project.agentCommands)
    if (!(await this.#isCommandAvailable(launchCommand, project.path))) {
      throw new SessionAgentUnavailableError(
        `${launchCommand[0] ?? input.agent} is not available`,
      )
    }
    const id = this.#createId()
    let cwd: string
    let worktreeBranch: string | null = null
    if (input.worktree === true) {
      if (this.#worktrees === undefined) {
        throw new Error('Worktree support is not configured')
      }
      cwd = await this.#worktrees.create(project, id, input.worktreeBranch)
      worktreeBranch = input.worktreeBranch
    } else {
      // An explicit cwd is confined to its own project. Without this a session
      // can start anywhere on the box regardless of which project it claims.
      cwd = project.path
      if (input.cwd !== undefined) {
        cwd = assertWithinRoot(project.path, normalizeAbsolutePath(input.cwd), {
          allowRoot: true,
        })
        await assertRealPathWithinRoot(project.path, cwd, {
          allowRoot: true,
          ...(this.#realPath === undefined ? {} : { realPath: this.#realPath }),
        })
      }
      if (!(await this.#isDirectory(cwd))) {
        throw new SessionDirectoryNotFoundError(`Directory ${cwd} was not found`)
      }
    }

    const createdAt = this.#now()
    const session: Session = {
      id,
      projectId: project.id,
      name: input.name,
      agent: input.agent,
      cwd,
      worktreeBranch,
      hasCwdConflict: false,
      state: 'idle',
      title: null,
      lastActivityAt: createdAt,
      createdAt,
    }

    let tmuxCreated = false
    try {
      await this.#tmux.createDetached(
        id,
        cwd,
        launchCommand,
      )
      tmuxCreated = true
      if (input.initialPrompt !== undefined && input.initialPrompt !== '') {
        await this.#tmux.sendLiteral(id, `${input.initialPrompt}\r`)
      }
      this.#repository.insert(session)
    } catch (error) {
      const rollbackErrors: unknown[] = [error]
      if (tmuxCreated) {
        await this.#tmux.kill(id).catch((rollbackError: unknown) => {
          rollbackErrors.push(rollbackError)
        })
      }
      if (worktreeBranch !== null && this.#worktrees !== undefined) {
        await this.#worktrees
          .rollback(project.path, cwd, worktreeBranch)
          .catch((rollbackError: unknown) => {
            rollbackErrors.push(rollbackError)
          })
      }
      if (rollbackErrors.length > 1) {
        throw new AggregateError(rollbackErrors, 'Session creation rollback failed')
      }
      throw error
    }
    return this.find(id) ?? session
  }

  list(): readonly Session[] {
    return withCwdConflicts(this.#repository.list())
  }

  find(sessionId: string): Session | null {
    return this.list().find(({ id }) => id === sessionId) ?? null
  }

  async diff(sessionId: string): Promise<DiffResult | null> {
    const session = this.#repository.find(sessionId)
    if (session === null) {
      return null
    }
    const project = this.#repository.findProject(session.projectId)
    if (project === null || this.#diffs === undefined) {
      throw new Error('Session diff support is not configured')
    }
    return this.#diffs.read(session, project.defaultBranch)
  }

  async delete(
    sessionId: string,
    options: DeleteSessionOptions = {},
  ): Promise<boolean> {
    const session = this.#repository.find(sessionId)
    if (session === null) {
      return false
    }
    const project = session.worktreeBranch === null
      ? null
      : this.#repository.findProject(session.projectId)
    if (session.worktreeBranch !== null) {
      if (project === null || this.#worktrees === undefined) {
        throw new Error('Worktree session has no project or worktree manager')
      }
      if (options.force !== true && await this.#worktrees.isDirty(session.cwd)) {
        throw new WorktreeDirtyError(`Worktree ${session.cwd} has uncommitted changes`)
      }
    }
    await this.#tmux.kill(sessionId)
    if (session.worktreeBranch !== null && project !== null && this.#worktrees !== undefined) {
      await this.#worktrees.remove(project.path, session.cwd, options.force === true)
    }
    return this.#repository.delete(sessionId)
  }
}

function withCwdConflicts(sessions: readonly Session[]): readonly Session[] {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    if (session.worktreeBranch === null) {
      counts.set(session.cwd, (counts.get(session.cwd) ?? 0) + 1)
    }
  }
  return sessions.map((session) => ({
    ...session,
    hasCwdConflict:
      session.worktreeBranch === null && (counts.get(session.cwd) ?? 0) > 1,
  }))
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

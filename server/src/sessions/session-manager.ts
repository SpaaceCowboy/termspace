import { stat } from 'node:fs/promises'

import type { AgentKind, Session } from '@termspace/contracts'

import { createSessionId } from './session-id.js'
import {
  assertRealPathWithinRoot,
  assertWithinRoot,
  normalizeAbsolutePath,
  type RealPath,
} from '../fs/contained-path.js'
import type { TmuxLaunchCommand } from '../tmux/tmux-client.js'

interface SessionRepositoryPort {
  delete(sessionId: string): boolean
  find(sessionId: string): Session | null
  findProject(projectId: string): { readonly id: string; readonly path: string } | null
  insert(session: Session): void
  list(): readonly Session[]
}

interface TmuxPort {
  createDetached(
    id: string,
    cwd: string,
    launchCommand?: TmuxLaunchCommand,
  ): Promise<void>
  kill(id: string): Promise<void>
}

interface SessionManagerOptions {
  readonly createId?: () => string
  readonly isDirectory?: (path: string) => Promise<boolean>
  readonly now?: () => number
  readonly realPath?: RealPath
}

export class SessionProjectNotFoundError extends Error {}
export class SessionDirectoryNotFoundError extends Error {}
export class SessionCwdOutsideProjectError extends Error {}

export class SessionManager {
  readonly #createId: () => string
  readonly #isDirectory: (path: string) => Promise<boolean>
  readonly #now: () => number
  readonly #realPath: RealPath | undefined
  readonly #repository: SessionRepositoryPort
  readonly #tmux: TmuxPort

  constructor(
    repository: SessionRepositoryPort,
    tmux: TmuxPort,
    options: SessionManagerOptions = {},
  ) {
    this.#repository = repository
    this.#tmux = tmux
    this.#createId = options.createId ?? createSessionId
    this.#isDirectory = options.isDirectory ?? isDirectory
    this.#now = options.now ?? Date.now
    this.#realPath = options.realPath
  }

  async create(
    projectId: string,
    name: string,
    agent: AgentKind,
    requestedCwd?: string,
  ): Promise<Session> {
    const project = this.#repository.findProject(projectId)
    if (project === null) {
      throw new SessionProjectNotFoundError(`Project ${projectId} was not found`)
    }
    // An explicit cwd is confined to its own project. Without this a session can
    // be started anywhere on the box regardless of which project it claims to
    // belong to, which makes the project boundary decorative.
    let cwd = project.path
    if (requestedCwd !== undefined) {
      cwd = assertWithinRoot(project.path, normalizeAbsolutePath(requestedCwd), {
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

    const id = this.#createId()
    const createdAt = this.#now()
    const session: Session = {
      id,
      projectId: project.id,
      name,
      agent,
      cwd,
      worktreeBranch: null,
      state: 'idle',
      title: null,
      lastActivityAt: createdAt,
      createdAt,
    }

    await this.#tmux.createDetached(id, cwd, toLaunchCommand(agent))
    try {
      this.#repository.insert(session)
    } catch (error) {
      try {
        await this.#tmux.kill(id)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          'Session persistence and tmux rollback both failed',
        )
      }
      throw error
    }
    return session
  }

  list(): readonly Session[] {
    return this.#repository.list()
  }

  find(sessionId: string): Session | null {
    return this.#repository.find(sessionId)
  }

  async delete(sessionId: string): Promise<boolean> {
    if (this.#repository.find(sessionId) === null) {
      return false
    }
    await this.#tmux.kill(sessionId)
    return this.#repository.delete(sessionId)
  }
}

function toLaunchCommand(agent: AgentKind): TmuxLaunchCommand | undefined {
  return agent === 'shell' ? undefined : agent
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

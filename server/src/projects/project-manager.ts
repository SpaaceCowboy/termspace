import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, rmdir, stat } from 'node:fs/promises'

import type {
  AgentCommandOverrides,
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '@termspace/contracts'

import {
  assertRealPathWithinRoot,
  assertWithinRoot,
  normalizeAbsolutePath,
  type RealPath,
} from '../fs/contained-path.js'
import type { ProcessRunner } from '../tmux/process-runner.js'
import { worktreeStoragePath } from '../git/worktree-manager.js'

interface ProjectRepositoryPort {
  claimSlug(base: string): string
  countSessions(projectId: string): number
  delete(projectId: string): boolean
  find(projectId: string): Project | null
  updateAgentCommands(
    projectId: string,
    agentCommands: AgentCommandOverrides,
  ): Project | null
  findConflict(slug: string, path: string): Project | null
  insert(project: Project): void
  list(): readonly Project[]
}

export { PathInvalidError as ProjectPathInvalidError } from '../fs/contained-path.js'
export { PathOutsideRootError as ProjectPathOutsideRootError } from '../fs/contained-path.js'
export class ProjectPathMissingError extends Error {}
export class ProjectPathNotCreatableError extends Error {}
export class ProjectPathOccupiedError extends Error {}
export class ProjectConflictError extends Error {}
export class ProjectCloneFailedError extends Error {}
export class ProjectHasSessionsError extends Error {}

interface ProjectManagerOptions {
  readonly createId?: () => string
  readonly now?: () => number
  readonly pathExists?: (path: string) => Promise<boolean>
  readonly makeDirectory?: (path: string) => Promise<void>
  readonly removeDirectory?: (path: string) => Promise<void>
  readonly isWritable?: (path: string) => Promise<boolean>
  readonly realPath?: RealPath
}

const DEFAULT_BRANCH = 'main'

export class ProjectManager {
  readonly #createId: () => string
  readonly #now: () => number
  readonly #pathExists: (path: string) => Promise<boolean>
  readonly #makeDirectory: (path: string) => Promise<void>
  readonly #removeDirectory: (path: string) => Promise<void>
  readonly #isWritable: (path: string) => Promise<boolean>
  readonly #processes: ProcessRunner
  readonly #realPath: RealPath | undefined
  readonly #projectRoot: string
  readonly #repository: ProjectRepositoryPort

  constructor(
    repository: ProjectRepositoryPort,
    processes: ProcessRunner,
    projectRoot: string,
    options: ProjectManagerOptions = {},
  ) {
    this.#repository = repository
    this.#processes = processes
    this.#projectRoot = normalizeAbsolutePath(projectRoot)
    this.#createId = options.createId ?? randomUUID
    this.#now = options.now ?? Date.now
    this.#pathExists = options.pathExists ?? pathExists
    this.#makeDirectory = options.makeDirectory ?? makeDirectory
    this.#removeDirectory = options.removeDirectory ?? removeDirectory
    this.#isWritable = options.isWritable ?? isWritable
    this.#realPath = options.realPath
  }

  list(): readonly Project[] {
    return this.#repository.list()
  }

  find(projectId: string): Project | null {
    return this.#repository.find(projectId)
  }

  get projectRoot(): string {
    return this.#projectRoot
  }

  /**
   * Whether the root can take a new project directory at all. Checked on demand
   * rather than cached: it is a mount and a permission bit, both of which can
   * change under a running server.
   */
  async projectRootWritable(): Promise<boolean> {
    return this.#isWritable(this.#projectRoot)
  }

  /**
   * Called once at startup. A missing root is the difference between "every
   * project creation fails with a confusing message" and a server that works,
   * so it is worth one `mkdir` — but never worth refusing to boot, since
   * sessions in projects that already exist are unaffected.
   */
  async ensureProjectRoot(): Promise<{ created: boolean; writable: boolean }> {
    if (!(await this.#pathExists(this.#projectRoot))) {
      try {
        await this.#makeDirectory(this.#projectRoot)
        return { created: true, writable: await this.#isWritable(this.#projectRoot) }
      } catch {
        return { created: false, writable: false }
      }
    }
    return { created: false, writable: await this.#isWritable(this.#projectRoot) }
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const path = assertWithinRoot(this.#projectRoot, normalizeAbsolutePath(input.path))
    const worktreeRoot = worktreeStoragePath(this.#projectRoot)
    if (path === worktreeRoot || path.startsWith(`${worktreeRoot}/`)) {
      throw new ProjectConflictError('That directory is reserved for Termspace worktrees')
    }
    const slug = this.#repository.claimSlug(slugify(input.name))

    if (this.#repository.findConflict(slug, path) !== null) {
      throw new ProjectConflictError(`A project already uses ${path}`)
    }

    // Re-check after resolving symlinks: the string check above cannot see a
    // link inside the root that points out of it.
    await assertRealPathWithinRoot(this.#projectRoot, path, {
      ...(this.#realPath === undefined ? {} : { realPath: this.#realPath }),
    })

    const exists = await this.#pathExists(path)
    if (input.repoUrl === undefined) {
      if (!exists) {
        if (input.createDirectory !== true) {
          throw new ProjectPathMissingError(`Directory ${path} was not found`)
        }
        await this.#makeProjectDirectory(path)
      }
    } else if (exists) {
      // Cloning onto an existing directory would either fail deep inside git or
      // silently adopt someone else's checkout. Refuse before touching disk.
      throw new ProjectPathOccupiedError(`${path} already exists`)
    }

    const defaultBranch = input.defaultBranch ?? DEFAULT_BRANCH
    if (input.repoUrl !== undefined) {
      await this.#clone(input.repoUrl, path, defaultBranch)
    }

    const project: Project = {
      id: this.#createId(),
      slug,
      name: input.name,
      path,
      repoUrl: input.repoUrl ?? null,
      defaultBranch,
      setupCommand: input.setupCommand ?? null,
      agentCommands: input.agentCommands ?? {},
      createdAt: this.#now(),
    }
    this.#repository.insert(project)
    return project
  }

  /** Refuses while sessions still reference it; the FK is RESTRICT anyway. */
  /**
   * Null when the project is gone. Overrides replace wholesale rather than
   * merge: an agent kind is removed from the map by omitting it, and a merge
   * would make that impossible to express.
   */
  update(projectId: string, input: UpdateProjectInput): Project | null {
    if (input.agentCommands === undefined) {
      return this.#repository.find(projectId)
    }
    return this.#repository.updateAgentCommands(projectId, input.agentCommands)
  }

  delete(projectId: string): boolean {
    if (this.#repository.find(projectId) === null) {
      return false
    }
    if (this.#repository.countSessions(projectId) > 0) {
      throw new ProjectHasSessionsError(
        `Project ${projectId} still has sessions`,
      )
    }
    return this.#repository.delete(projectId)
  }

  /**
   * Creating the directory reopens the containment question: the string check
   * and the symlink check both ran against a path that did not exist yet, and
   * the parent could be a link out of the root. Verify what actually landed on
   * disk, and take back only what we just made if it is wrong.
   */
  async #makeProjectDirectory(path: string): Promise<void> {
    try {
      await this.#makeDirectory(path)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new ProjectPathNotCreatableError(detail)
    }
    try {
      await assertRealPathWithinRoot(this.#projectRoot, path, {
        ...(this.#realPath === undefined ? {} : { realPath: this.#realPath }),
      })
    } catch (error) {
      await this.#removeDirectory(path).catch(() => undefined)
      throw error
    }
  }

  async #clone(repoUrl: string, path: string, branch: string): Promise<void> {
    try {
      await this.#processes.run('git', [
        'clone',
        '--branch',
        branch,
        '--',
        repoUrl,
        path,
      ])
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new ProjectCloneFailedError(detail)
    }
  }
}

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
  return slug === '' ? 'project' : slug
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** 0700: a project directory is this user's working copy, nobody else's. */
async function makeDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
}

/** Only ever used to undo a directory this process just made, so never recursive. */
async function removeDirectory(path: string): Promise<void> {
  await rmdir(path)
}

async function isWritable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

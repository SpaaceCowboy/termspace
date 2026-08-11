import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'

import type { CreateProjectInput, Project } from '@termspace/contracts'

import {
  assertRealPathWithinRoot,
  assertWithinRoot,
  normalizeAbsolutePath,
  type RealPath,
} from '../fs/contained-path.js'
import type { ProcessRunner } from '../tmux/process-runner.js'

interface ProjectRepositoryPort {
  claimSlug(base: string): string
  countSessions(projectId: string): number
  delete(projectId: string): boolean
  find(projectId: string): Project | null
  findConflict(slug: string, path: string): Project | null
  insert(project: Project): void
  list(): readonly Project[]
}

export { PathInvalidError as ProjectPathInvalidError } from '../fs/contained-path.js'
export { PathOutsideRootError as ProjectPathOutsideRootError } from '../fs/contained-path.js'
export class ProjectPathMissingError extends Error {}
export class ProjectPathOccupiedError extends Error {}
export class ProjectConflictError extends Error {}
export class ProjectCloneFailedError extends Error {}
export class ProjectHasSessionsError extends Error {}

interface ProjectManagerOptions {
  readonly createId?: () => string
  readonly now?: () => number
  readonly pathExists?: (path: string) => Promise<boolean>
  readonly realPath?: RealPath
}

const DEFAULT_BRANCH = 'main'

export class ProjectManager {
  readonly #createId: () => string
  readonly #now: () => number
  readonly #pathExists: (path: string) => Promise<boolean>
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

  async create(input: CreateProjectInput): Promise<Project> {
    const path = assertWithinRoot(this.#projectRoot, normalizeAbsolutePath(input.path))
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
        throw new ProjectPathMissingError(`Directory ${path} was not found`)
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
      createdAt: this.#now(),
    }
    this.#repository.insert(project)
    return project
  }

  /** Refuses while sessions still reference it; the FK is RESTRICT anyway. */
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

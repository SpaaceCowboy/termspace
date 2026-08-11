import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Project } from '@termspace/contracts'

import type { CommandResult, ProcessRunner } from '../tmux/process-runner.js'
import {
  PathInvalidError,
  PathOutsideRootError,
  normalizeAbsolutePath,
} from '../fs/contained-path.js'
import {
  ProjectCloneFailedError,
  ProjectConflictError,
  ProjectHasSessionsError,
  ProjectPathMissingError,
  ProjectPathNotCreatableError,
  ProjectPathOccupiedError,
  ProjectManager,
  slugify,
} from './project-manager.js'

const ROOT = '/srv/projects'

class FakeRunner implements ProcessRunner {
  readonly calls: { command: string; arguments_: readonly string[] }[] = []
  error: Error | undefined

  async run(command: string, arguments_: readonly string[]): Promise<CommandResult> {
    this.calls.push({ command, arguments_ })
    if (this.error !== undefined) {
      throw this.error
    }
    return { stdout: '', stderr: '' }
  }
}

class FakeRepository {
  readonly rows: Project[] = []
  sessionCount = 0
  takenSlugs: string[] = []

  claimSlug(base: string): string {
    if (!this.takenSlugs.includes(base)) {
      return base
    }
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base}-${String(suffix)}`
      if (!this.takenSlugs.includes(candidate)) {
        return candidate
      }
    }
  }

  countSessions(): number {
    return this.sessionCount
  }

  delete(projectId: string): boolean {
    const index = this.rows.findIndex((row) => row.id === projectId)
    if (index === -1) {
      return false
    }
    this.rows.splice(index, 1)
    return true
  }

  find(projectId: string): Project | null {
    return this.rows.find((row) => row.id === projectId) ?? null
  }

  findConflict(slug: string, path: string): Project | null {
    return this.rows.find((row) => row.slug === slug || row.path === path) ?? null
  }

  insert(project: Project): void {
    this.rows.push(project)
  }

  list(): readonly Project[] {
    return this.rows
  }
}

function build(existingPaths: readonly string[] = [], options: BuildOptions = {}) {
  const repository = new FakeRepository()
  const runner = new FakeRunner()
  const paths = [...existingPaths]
  const made: string[] = []
  const removed: string[] = []
  const manager = new ProjectManager(repository, runner, ROOT, {
    createId: () => 'prj_fixed',
    now: () => 1_000,
    pathExists: async (path) => paths.includes(path),
    makeDirectory: async (path) => {
      if (options.makeFails === true) {
        throw new Error('EACCES: permission denied')
      }
      made.push(path)
      paths.push(path)
    },
    removeDirectory: async (path) => {
      removed.push(path)
      const index = paths.indexOf(path)
      if (index !== -1) {
        paths.splice(index, 1)
      }
    },
    isWritable: async () => options.writable ?? true,
    ...(options.realPath === undefined ? {} : { realPath: options.realPath }),
  })
  return { manager, repository, runner, made, removed }
}

interface BuildOptions {
  readonly makeFails?: boolean
  readonly writable?: boolean
  readonly realPath?: (path: string) => Promise<string>
}

describe('normalizeAbsolutePath', () => {
  it('accepts an absolute path and strips trailing slashes', () => {
    assert.equal(normalizeAbsolutePath('/srv/projects/portal-ui/'), '/srv/projects/portal-ui')
    assert.equal(normalizeAbsolutePath('  /srv/projects/a//b  '), '/srv/projects/a/b')
  })

  it('refuses relative, root, and null-byte paths', () => {
    for (const bad of ['', 'relative/path', '~/projects', '/', '//', '/srv/\0/x']) {
      assert.throws(
        () => normalizeAbsolutePath(bad),
        PathInvalidError,
        `accepted ${JSON.stringify(bad)}`,
      )
    }
  })

  it('resolves traversal rather than rejecting it, so the stored path is the used path', () => {
    assert.equal(normalizeAbsolutePath('/srv/projects/a/../b'), '/srv/projects/b')
    assert.equal(normalizeAbsolutePath('/srv/../etc'), '/etc')
  })
})

describe('slugify', () => {
  it('reduces a name to a url-safe slug', () => {
    assert.equal(slugify('Portal UI'), 'portal-ui')
    assert.equal(slugify('  API   Refactor!! '), 'api-refactor')
    assert.equal(slugify('!!!'), 'project')
    assert.equal(slugify('a'.repeat(100)).length, 48)
  })
})

describe('ProjectManager', () => {
  it('adopts an existing directory without touching git', async () => {
    const { manager, runner } = build(['/srv/projects/portal-ui'])
    const project = await manager.create({ name: 'Portal UI', path: '/srv/projects/portal-ui/' })

    assert.deepEqual(project, {
      id: 'prj_fixed',
      slug: 'portal-ui',
      name: 'Portal UI',
      path: '/srv/projects/portal-ui',
      repoUrl: null,
      defaultBranch: 'main',
      setupCommand: null,
      createdAt: 1_000,
    })
    assert.deepEqual(runner.calls, [])
  })

  it('refuses to adopt a directory that is not there', async () => {
    const { manager } = build()
    await assert.rejects(
      manager.create({ name: 'Portal UI', path: '/srv/projects/portal-ui' }),
      ProjectPathMissingError,
    )
  })

  it('creates the directory when asked, and starts an empty project in it', async () => {
    const { manager, made, runner } = build()
    const project = await manager.create({
      name: 'Portal UI',
      path: '/srv/projects/portal-ui',
      createDirectory: true,
    })

    assert.deepEqual(made, ['/srv/projects/portal-ui'])
    assert.equal(project.path, '/srv/projects/portal-ui')
    assert.equal(project.repoUrl, null)
    assert.deepEqual(runner.calls, [], 'an empty project never touches git')
  })

  it('adopts an existing directory rather than failing when asked to create it', async () => {
    const { manager, made } = build(['/srv/projects/portal-ui'])
    const project = await manager.create({
      name: 'Portal UI',
      path: '/srv/projects/portal-ui',
      createDirectory: true,
    })

    assert.equal(project.path, '/srv/projects/portal-ui')
    assert.deepEqual(made, [], 'nothing was created over the top of it')
  })

  it('reports a directory it could not create rather than a missing one', async () => {
    const { manager } = build([], { makeFails: true })
    await assert.rejects(
      manager.create({
        name: 'Portal UI',
        path: '/srv/projects/portal-ui',
        createDirectory: true,
      }),
      ProjectPathNotCreatableError,
    )
  })

  it('takes back a directory it created if that directory resolves outside the root', async () => {
    // The containment check before the mkdir cannot be a lock: a symlink can be
    // swapped under us between the check and the create. Here the first
    // resolution is inside the root and the one after the mkdir is not.
    let resolvedOnce = false
    const { manager, made, removed } = build([], {
      realPath: async (path) => {
        if (path !== '/srv/projects/portal-ui') {
          return path
        }
        if (!resolvedOnce) {
          resolvedOnce = true
          return path
        }
        return '/etc/portal-ui'
      },
    })

    await assert.rejects(
      manager.create({
        name: 'Portal UI',
        path: '/srv/projects/portal-ui',
        createDirectory: true,
      }),
      PathOutsideRootError,
    )
    assert.deepEqual(made, ['/srv/projects/portal-ui'])
    assert.deepEqual(removed, ['/srv/projects/portal-ui'], 'it cleaned up after itself')
  })

  it('creates a missing project root at startup and reports whether it is writable', async () => {
    const { manager, made } = build()
    assert.deepEqual(await manager.ensureProjectRoot(), { created: true, writable: true })
    assert.deepEqual(made, [ROOT])

    const readOnly = build([ROOT], { writable: false })
    assert.deepEqual(await readOnly.manager.ensureProjectRoot(), {
      created: false,
      writable: false,
    })
    assert.equal(await readOnly.manager.projectRootWritable(), false)
  })

  it('does not claim the root is writable when it could not be created', async () => {
    const { manager } = build([], { makeFails: true })
    assert.deepEqual(await manager.ensureProjectRoot(), { created: false, writable: false })
  })

  it('clones into a path that does not exist yet', async () => {
    const { manager, runner } = build()
    const project = await manager.create({
      name: 'Portal UI',
      path: '/srv/projects/portal-ui',
      repoUrl: 'https://github.com/example/portal-ui.git',
      defaultBranch: 'develop',
    })

    assert.equal(project.repoUrl, 'https://github.com/example/portal-ui.git')
    assert.deepEqual(runner.calls, [
      {
        command: 'git',
        // The `--` matters: without it a repo URL starting with a dash is a flag.
        arguments_: [
          'clone',
          '--branch',
          'develop',
          '--',
          'https://github.com/example/portal-ui.git',
          '/srv/projects/portal-ui',
        ],
      },
    ])
  })

  it('refuses to clone onto an existing directory', async () => {
    const { manager, runner } = build(['/srv/projects/portal-ui'])
    await assert.rejects(
      manager.create({
        name: 'Portal UI',
        path: '/srv/projects/portal-ui',
        repoUrl: 'https://github.com/example/portal-ui.git',
      }),
      ProjectPathOccupiedError,
    )
    assert.deepEqual(runner.calls, [])
  })

  it('does not persist a project whose clone failed', async () => {
    const { manager, repository, runner } = build()
    runner.error = new Error('fatal: repository not found')
    await assert.rejects(
      manager.create({
        name: 'Portal UI',
        path: '/srv/projects/portal-ui',
        repoUrl: 'https://github.com/example/nope.git',
      }),
      ProjectCloneFailedError,
    )
    assert.deepEqual(repository.list(), [])
  })

  it('refuses a second project on the same directory', async () => {
    const { manager } = build(['/srv/projects/portal-ui'])
    await manager.create({ name: 'Portal UI', path: '/srv/projects/portal-ui' })
    await assert.rejects(
      manager.create({ name: 'Something Else', path: '/srv/projects/portal-ui' }),
      ProjectConflictError,
    )
  })

  it('gives a duplicate name a distinct slug', async () => {
    const { manager, repository } = build(['/srv/projects/a', '/srv/projects/b'])
    repository.takenSlugs = ['portal-ui']
    const second = await manager.create({ name: 'Portal UI', path: '/srv/projects/b' })
    assert.equal(second.slug, 'portal-ui-2')
  })

  it('refuses any path outside the project root, including the root itself', async () => {
    const { manager, repository, runner } = build([
      '/etc',
      '/home/app',
      '/srv/projects',
      '/srv/projects-evil/x',
    ])
    for (const path of [
      '/etc',
      '/home/app',
      '/srv/projects', // the root itself: deleting it would take every project
      '/srv/projects/../../etc', // normalizes to /etc, so containment must run after
      '/srv/projects-evil/x', // a prefix match on the string alone would allow this
    ]) {
      await assert.rejects(
        manager.create({ name: 'Escape', path }),
        PathOutsideRootError,
        `accepted ${path}`,
      )
    }
    assert.deepEqual(repository.list(), [])
    assert.deepEqual(runner.calls, [])
  })

  it('refuses to clone outside the project root before running git', async () => {
    const { manager, runner } = build()
    await assert.rejects(
      manager.create({
        name: 'Escape',
        path: '/home/app/.ssh',
        repoUrl: 'https://github.com/example/x.git',
      }),
      PathOutsideRootError,
    )
    assert.deepEqual(runner.calls, [])
  })

  it('rejects a project root that is not an absolute path', () => {
    assert.throws(
      () => new ProjectManager(new FakeRepository(), new FakeRunner(), 'relative'),
      PathInvalidError,
    )
  })

  it('refuses to delete a project that still has sessions', async () => {
    const { manager, repository } = build(['/srv/projects/portal-ui'])
    const project = await manager.create({ name: 'Portal UI', path: '/srv/projects/portal-ui' })
    repository.sessionCount = 1
    assert.throws(() => manager.delete(project.id), ProjectHasSessionsError)

    repository.sessionCount = 0
    assert.equal(manager.delete(project.id), true)
    assert.equal(manager.delete(project.id), false)
  })
})

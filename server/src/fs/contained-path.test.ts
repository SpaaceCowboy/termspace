import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'

import {
  PathOutsideRootError,
  assertRealPathWithinRoot,
  assertWithinRoot,
  normalizeAbsolutePath,
} from './contained-path.js'

describe('assertWithinRoot', () => {
  it('allows a descendant and rejects an escape', () => {
    assert.equal(assertWithinRoot('/srv/projects', '/srv/projects/a'), '/srv/projects/a')
    assert.throws(
      () => assertWithinRoot('/srv/projects', '/srv/projects-evil/a'),
      PathOutsideRootError,
    )
    assert.throws(() => assertWithinRoot('/srv/projects', '/etc'), PathOutsideRootError)
  })

  it('treats the root itself as out unless allowRoot is set', () => {
    assert.throws(
      () => assertWithinRoot('/srv/projects', '/srv/projects'),
      PathOutsideRootError,
    )
    assert.equal(
      assertWithinRoot('/srv/projects', '/srv/projects', { allowRoot: true }),
      '/srv/projects',
    )
  })
})

describe('assertRealPathWithinRoot', () => {
  const base = mkdtempSync(join(tmpdir(), 'termspace-contained-'))
  const root = join(base, 'root')
  const outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  mkdirSync(join(root, 'real'))

  after(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('accepts a real directory under the root', async () => {
    await assertRealPathWithinRoot(root, join(root, 'real'))
  })

  it('rejects a symlink under the root that points out of it', async () => {
    const link = join(root, 'escape')
    symlinkSync(outside, link)
    // The string check cannot see this — that is the whole point of the resolve.
    assert.equal(assertWithinRoot(root, link), link)
    await assert.rejects(assertRealPathWithinRoot(root, link), PathOutsideRootError)
  })

  it('rejects a path under a symlinked parent that points out of the root', async () => {
    const link = join(root, 'linked-parent')
    symlinkSync(outside, link)
    await assert.rejects(
      assertRealPathWithinRoot(root, join(link, 'child')),
      PathOutsideRootError,
    )
  })

  it('accepts a target that does not exist yet, as a clone target does', async () => {
    await assertRealPathWithinRoot(root, join(root, 'not-yet'))
    await assertRealPathWithinRoot(root, join(root, 'not', 'yet', 'deep'))
  })

  it('follows a root that is itself a symlink', async () => {
    const linkedRoot = join(base, 'root-link')
    symlinkSync(root, linkedRoot)
    // Resolving only the target would make every real path look like an escape.
    await assertRealPathWithinRoot(linkedRoot, join(root, 'real'))
    await assertRealPathWithinRoot(linkedRoot, join(linkedRoot, 'real'))
  })

  it('rejects a symlinked clone target before anything is created', async () => {
    const link = join(root, 'clone-target')
    symlinkSync(join(outside, 'nope'), link)
    await assert.rejects(
      assertRealPathWithinRoot(root, normalizeAbsolutePath(link)),
      PathOutsideRootError,
    )
  })
})

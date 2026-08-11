import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'

export class PathInvalidError extends Error {}
export class PathOutsideRootError extends Error {}

export type RealPath = (path: string) => Promise<string>

const systemRealPath: RealPath = (path) => realpath(path)

/**
 * Normalizes an untrusted absolute path. `normalize` resolves any `..` here, so
 * what every later step uses — the `git clone` argv, the tmux cwd, the stored
 * row — is exactly the string this returns.
 */
export function normalizeAbsolutePath(untrustedPath: string): string {
  const trimmed = untrustedPath.trim()
  if (trimmed.includes('\0')) {
    throw new PathInvalidError('Path must not contain a null byte')
  }
  if (trimmed === '' || !isAbsolute(trimmed)) {
    throw new PathInvalidError('Path must be absolute')
  }
  const normalized = normalize(trimmed).replace(/\/+$/, '')
  if (normalized === '' || normalized === '/') {
    throw new PathInvalidError('Path must not be the filesystem root')
  }
  return normalized
}

export interface WithinRootOptions {
  /**
   * Whether `path === root` passes. A session's cwd defaults to the project
   * directory itself, so there it must; a *project* directory must be strictly
   * under the project root, or deleting it would take every sibling with it.
   */
  readonly allowRoot?: boolean
}

/**
 * Both arguments must already be normalized, so that `..` is resolved before the
 * comparison rather than after it.
 *
 * This is a containment check on the path string, not on what the filesystem
 * resolves it to — a pre-existing symlink under the root can still point out of
 * it, and a session is a real shell that can `cd` anywhere regardless. It bounds
 * mistakes, it is not a sandbox.
 */
export function assertWithinRoot(
  root: string,
  path: string,
  options: WithinRootOptions = {},
): string {
  const offset = relative(root, path)
  const escapes = offset.startsWith('..') || isAbsolute(offset)
  if (escapes || (offset === '' && options.allowRoot !== true)) {
    throw new PathOutsideRootError(`Path must be inside ${root}`)
  }
  return path
}

/**
 * Resolves symlinks in `path` before the containment check, so a link under the
 * root that points outside it is caught. Paths that do not exist yet are fine:
 * the nearest existing ancestor is resolved and the remaining segments are
 * re-appended, which is what a `git clone` target looks like.
 *
 * This is still a check, not a lock. Between the check and the use of the path,
 * a symlink could be swapped by anything running as this user — including
 * another session. Closing that needs an OS-level boundary, not a path test.
 */
export async function assertRealPathWithinRoot(
  root: string,
  path: string,
  options: WithinRootOptions & { readonly realPath?: RealPath } = {},
): Promise<string> {
  const resolve = options.realPath ?? systemRealPath
  const realRoot = await resolveNearestExisting(root, resolve)
  const realTarget = await resolveNearestExisting(path, resolve)
  assertWithinRoot(realRoot, realTarget, options)
  return path
}

/**
 * `realpath` of the deepest ancestor that exists, with the missing tail joined
 * back on. A missing tail cannot itself be a symlink, so this is sound.
 */
async function resolveNearestExisting(path: string, resolve: RealPath): Promise<string> {
  const missing: string[] = []
  let candidate = path
  for (;;) {
    try {
      const resolved = await resolve(candidate)
      return missing.length === 0 ? resolved : join(resolved, ...missing.reverse())
    } catch {
      // `realpath` failing while the entry itself exists means a dangling
      // symlink. Treating it as "missing" would walk past it to the parent and
      // judge the link by where it sits rather than where it points.
      if (await entryExists(candidate)) {
        throw new PathOutsideRootError(`${candidate} does not resolve to a real path`)
      }
      const parent = dirname(candidate)
      if (parent === candidate) {
        // Nothing on the way up exists; the string check already ran on it.
        return path
      }
      missing.push(candidate.slice(parent.length + 1))
      candidate = parent
    }
  }
}

async function entryExists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

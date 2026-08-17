import type { DiffFile, DiffFileStatus, DiffResult, Session } from '@termspace/contracts'

import type { BoundedCommandResult } from '../tmux/process-runner.js'

export const DIFF_METADATA_MAX_BYTES = 512 * 1_024
export const DIFF_PATCH_MAX_BYTES = 1_024 * 1_024
export const DIFF_MAX_FILES = 2_000

interface BoundedRunner {
  runBounded(
    command: string,
    arguments_: readonly string[],
    maxStdoutBytes: number,
  ): Promise<BoundedCommandResult>
}

export class DiffUnavailableError extends Error {}

export class GitDiffReader {
  readonly #runner: BoundedRunner

  constructor(runner: BoundedRunner) {
    this.#runner = runner
  }

  async read(session: Session, baseBranch: string): Promise<DiffResult> {
    try {
      const common = ['-C', session.cwd, 'diff', '--no-ext-diff', '--no-color', '--find-renames']
      const [names, stats, untracked, patch] = await Promise.all([
        this.#runner.runBounded(
          'git',
          [...common, '--name-status', '-z', baseBranch, '--'],
          DIFF_METADATA_MAX_BYTES,
        ),
        this.#runner.runBounded(
          'git',
          [...common, '--numstat', '-z', baseBranch, '--'],
          DIFF_METADATA_MAX_BYTES,
        ),
        this.#runner.runBounded(
          'git',
          ['-C', session.cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
          DIFF_METADATA_MAX_BYTES,
        ),
        this.#runner.runBounded(
          'git',
          [...common, '--patch', baseBranch, '--'],
          DIFF_PATCH_MAX_BYTES,
        ),
      ])

      const statByPath = parseNumstat(stats.stdout)
      const tracked = parseNameStatus(names.stdout).map((file) => {
        const stat = statByPath.get(file.path)
        return {
          ...file,
          additions: stat?.additions ?? null,
          deletions: stat?.deletions ?? null,
          binary: stat?.binary ?? false,
        }
      })
      const known = new Set(tracked.map(({ path }) => path))
      const untrackedFiles = parseUntracked(untracked.stdout)
        .filter((path) => !known.has(path))
        .map((path): DiffFile => ({
          path,
          previousPath: null,
          status: 'untracked',
          additions: null,
          deletions: null,
          binary: false,
        }))
      const allFiles = [...tracked, ...untrackedFiles]
      const fileLimitHit = allFiles.length > DIFF_MAX_FILES

      return {
        sessionId: session.id,
        baseBranch,
        files: allFiles.slice(0, DIFF_MAX_FILES),
        patch: patch.stdout,
        truncated:
          names.truncated ||
          stats.truncated ||
          untracked.truncated ||
          patch.truncated ||
          fileLimitHit,
      }
    } catch (error) {
      throw new DiffUnavailableError(error instanceof Error ? error.message : String(error))
    }
  }
}

interface NameStatusFile {
  readonly path: string
  readonly previousPath: string | null
  readonly status: DiffFileStatus
}

function parseNameStatus(value: string): NameStatusFile[] {
  const tokens = completeNulTokens(value)
  const files: NameStatusFile[] = []
  for (let index = 0; index < tokens.length;) {
    const code = tokens[index++]
    if (code === undefined || code === '') {
      continue
    }
    if (code.startsWith('R') || code.startsWith('C')) {
      const previousPath = tokens[index++]
      const path = tokens[index++]
      if (previousPath === undefined || path === undefined) {
        break
      }
      files.push({
        path,
        previousPath,
        status: code.startsWith('R') ? 'renamed' : 'copied',
      })
      continue
    }
    const path = tokens[index++]
    if (path !== undefined) {
      files.push({ path, previousPath: null, status: mapStatus(code) })
    }
  }
  return files
}

function parseNumstat(
  value: string,
): Map<string, { additions: number | null; deletions: number | null; binary: boolean }> {
  const tokens = completeNulTokens(value)
  const stats = new Map<string, { additions: number | null; deletions: number | null; binary: boolean }>()
  for (let index = 0; index < tokens.length;) {
    const record = tokens[index++]
    if (record === undefined || record === '') {
      continue
    }
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (firstTab === -1 || secondTab === -1) {
      continue
    }
    const added = record.slice(0, firstTab)
    const deleted = record.slice(firstTab + 1, secondTab)
    let path = record.slice(secondTab + 1)
    if (path === '') {
      index += 1 // previous rename/copy path
      path = tokens[index++] ?? ''
    }
    if (path === '') {
      continue
    }
    const binary = added === '-' || deleted === '-'
    stats.set(path, {
      additions: binary ? null : parseCount(added),
      deletions: binary ? null : parseCount(deleted),
      binary,
    })
  }
  return stats
}

function parseUntracked(value: string): string[] {
  return completeNulTokens(value)
    .filter((record) => record.startsWith('?? '))
    .map((record) => record.slice(3))
}

function completeNulTokens(value: string): string[] {
  const tokens = value.split('\0')
  if (!value.endsWith('\0')) {
    tokens.pop()
  }
  return tokens
}

function mapStatus(code: string): DiffFileStatus {
  if (code.includes('U')) return 'conflicted'
  switch (code[0]) {
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    default: return 'modified'
  }
}

function parseCount(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null
}

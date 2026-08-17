import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GitDiffReader } from './dist/git/diff-reader.js'
import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'

const root = await mkdtemp(join(tmpdir(), 'termspace-diff-'))
const projectPath = join(root, 'project')
const processes = new ExecFileProcessRunner()

try {
  await mkdir(projectPath)
  await git(['init', '-b', 'main'])
  await git(['config', 'user.name', 'Termspace E2E'])
  await git(['config', 'user.email', 'termspace@example.invalid'])
  await writeFile(join(projectPath, 'changed.txt'), 'one\ntwo\n')
  await writeFile(join(projectPath, 'old name.txt'), 'rename me\n')
  await writeFile(join(projectPath, 'binary.dat'), Buffer.from([0, 1, 2, 3]))
  await git(['add', '.'])
  await git(['commit', '-m', 'fixture'])

  await writeFile(join(projectPath, 'changed.txt'), 'one\ntwo changed\nthree\n')
  await rename(join(projectPath, 'old name.txt'), join(projectPath, 'new name.txt'))
  await writeFile(join(projectPath, 'binary.dat'), Buffer.from([0, 4, 5, 6]))
  await git(['add', '-A', '--', 'old name.txt', 'new name.txt'])
  await writeFile(join(projectPath, 'untracked file.txt'), 'not in the patch\n')

  const session = {
    id: 'ses_diffreader001',
    projectId: 'project-e2e',
    name: 'Diff E2E',
    agent: 'shell',
    cwd: projectPath,
    worktreeBranch: null,
    hasCwdConflict: false,
    state: 'idle',
    title: null,
    lastActivityAt: 1,
    createdAt: 1,
  }
  const result = await new GitDiffReader(processes).read(session, 'main')
  const byPath = new Map(result.files.map((file) => [file.path, file]))

  assert.deepEqual(
    byPath.get('changed.txt'),
    {
      path: 'changed.txt', previousPath: null, status: 'modified',
      additions: 2, deletions: 1, binary: false,
    },
  )
  assert.equal(byPath.get('new name.txt')?.previousPath, 'old name.txt')
  assert.equal(byPath.get('new name.txt')?.status, 'renamed')
  assert.equal(byPath.get('binary.dat')?.binary, true)
  assert.equal(byPath.get('untracked file.txt')?.status, 'untracked')
  assert.match(result.patch, /diff --git a\/changed\.txt b\/changed\.txt/)
  assert.equal(result.patch.includes('untracked file.txt'), false)
  assert.equal(result.truncated, false)

  console.log('7/7 diff checks passed against a real git repository')
} finally {
  await rm(root, { recursive: true, force: true })
}

async function git(arguments_) {
  return processes.run('git', ['-C', projectPath, ...arguments_])
}

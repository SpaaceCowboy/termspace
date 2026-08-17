import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { WorktreeDirtyError, WorktreeManager } from './dist/git/worktree-manager.js'
import { SessionManager } from './dist/sessions/session-manager.js'
import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'
import { TmuxClient } from './dist/tmux/tmux-client.js'

const SID = 'ses_worktree0001'
const BRANCH = 'ts/e2e-worktree'
const root = await mkdtemp(join(tmpdir(), 'termspace-worktree-'))
const projectPath = join(root, 'project')
const processes = new ExecFileProcessRunner()
const tmux = new TmuxClient(processes)
const rows = []

const project = {
  id: 'project-e2e',
  path: projectPath,
  defaultBranch: 'main',
  agentCommands: {},
}

const repository = {
  findProject: (id) => id === project.id ? project : null,
  insert: (session) => { rows.push(session) },
  list: () => rows,
  find: (id) => rows.find((session) => session.id === id) ?? null,
  delete: (id) => {
    const index = rows.findIndex((session) => session.id === id)
    if (index === -1) return false
    rows.splice(index, 1)
    return true
  },
}

try {
  await mkdir(projectPath)
  await git(projectPath, ['init', '-b', 'main'])
  await git(projectPath, ['config', 'user.name', 'Termspace E2E'])
  await git(projectPath, ['config', 'user.email', 'termspace@example.invalid'])
  await writeFile(join(projectPath, 'README.md'), '# fixture\n')
  await git(projectPath, ['add', 'README.md'])
  await git(projectPath, ['commit', '-m', 'fixture'])

  const sessions = new SessionManager(repository, tmux, {
    createId: () => SID,
    worktrees: new WorktreeManager(processes, root),
  })
  const session = await sessions.create({
    projectId: project.id,
    name: 'Worktree E2E',
    agent: 'shell',
    worktree: true,
    worktreeBranch: BRANCH,
  })

  assert.equal((await git(session.cwd, ['branch', '--show-current'])).stdout.trim(), BRANCH)
  assert.ok((await tmux.listSessionIds()).has(SID))

  await writeFile(join(session.cwd, 'uncommitted.txt'), 'do not lose this\n')
  await assert.rejects(sessions.delete(SID), WorktreeDirtyError)
  assert.ok((await tmux.listSessionIds()).has(SID), 'dirty refusal did not kill tmux')
  assert.equal((await stat(join(session.cwd, 'uncommitted.txt'))).isFile(), true)

  assert.equal(await sessions.delete(SID, { force: true }), true)
  assert.equal((await tmux.listSessionIds()).has(SID), false)
  await assert.rejects(stat(session.cwd))
  await git(projectPath, ['show-ref', '--verify', `refs/heads/${BRANCH}`])

  console.log('5/5 worktree checks passed against real git and tmux')
} finally {
  if ((await tmux.listSessionIds().catch(() => new Set())).has(SID)) {
    await tmux.kill(SID).catch(() => undefined)
  }
  await rm(root, { recursive: true, force: true })
}

async function git(cwd, arguments_) {
  return processes.run('git', ['-C', cwd, ...arguments_])
}

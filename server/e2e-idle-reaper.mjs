import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SessionIdleReaper } from './dist/sessions/session-idle-reaper.js'
import { SessionManager } from './dist/sessions/session-manager.js'
import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'
import { TmuxClient } from './dist/tmux/tmux-client.js'

const OLD_SID = 'ses_reaperold001'
const RECENT_SID = 'ses_reapernew001'
const project = {
  id: 'project-reaper-e2e',
  path: await mkdtemp(join(tmpdir(), 'termspace-reaper-')),
  defaultBranch: 'main',
  agentCommands: {},
}
const rows = [session(OLD_SID, 1_000), session(RECENT_SID, 9_000)]
const repository = {
  findProject: (id) => id === project.id ? project : null,
  insert: (value) => { rows.push(value) },
  list: () => rows,
  find: (id) => rows.find((value) => value.id === id) ?? null,
  delete: (id) => {
    const index = rows.findIndex((value) => value.id === id)
    if (index === -1) return false
    rows.splice(index, 1)
    return true
  },
}
const tmux = new TmuxClient(new ExecFileProcessRunner(), {
  socketName: `termspace-reaper-${process.pid}`,
})
const manager = new SessionManager(repository, tmux)

try {
  await tmux.createDetached(OLD_SID, project.path, ['sh', '-lc', 'sleep 30'])
  await tmux.createDetached(RECENT_SID, project.path, ['sh', '-lc', 'sleep 30'])

  const reaper = new SessionIdleReaper({
    sessions: manager,
    graceMs: 5_000,
    now: () => 10_000,
  })
  await reaper.reap()

  assert.equal(manager.find(OLD_SID), null, 'expired row was deleted')
  assert.equal((await tmux.listSessionIds()).has(OLD_SID), false, 'expired tmux session was killed')
  assert.notEqual(manager.find(RECENT_SID), null, 'recent row was preserved')
  assert.equal((await tmux.listSessionIds()).has(RECENT_SID), true, 'recent tmux session survived')
  console.log('4/4 idle reaper checks passed against real tmux')
} finally {
  for (const id of [OLD_SID, RECENT_SID]) {
    try {
      await tmux.kill(id)
    } catch {
      // A successfully reaped session is already absent.
    }
  }
  await rm(project.path, { recursive: true, force: true })
}

function session(id, lastActivityAt) {
  return {
    id,
    projectId: project.id,
    name: id,
    agent: 'shell',
    cwd: project.path,
    worktreeBranch: null,
    hasCwdConflict: false,
    state: 'idle',
    title: null,
    lastActivityAt,
    createdAt: lastActivityAt,
  }
}

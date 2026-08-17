import assert from 'node:assert/strict'

import { SessionManager } from './dist/sessions/session-manager.js'
import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'
import { TmuxClient } from './dist/tmux/tmux-client.js'

const SID = 'ses_staledelete1'
const project = {
  id: 'project-stale-e2e',
  path: '/definitely/missing/termspace-project',
  defaultBranch: 'main',
  agentCommands: {},
}
const rows = [{
  id: SID,
  projectId: project.id,
  name: 'Stale session',
  agent: 'shell',
  cwd: project.path,
  worktreeBranch: null,
  hasCwdConflict: false,
  state: 'dead',
  title: null,
  lastActivityAt: 1,
  createdAt: 1,
}]
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
const tmux = new TmuxClient(new ExecFileProcessRunner())
assert.equal((await tmux.listSessionIds()).has(SID), false)

const manager = new SessionManager(repository, tmux)
assert.equal(await manager.delete(SID), true)
assert.deepEqual(rows, [])

console.log('3/3 stale deletion checks passed against real tmux')

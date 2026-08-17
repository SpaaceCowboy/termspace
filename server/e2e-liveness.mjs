import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SessionActivityTracker } from './dist/activity/activity-tracker.js'
import { SessionLivenessReconciler } from './dist/sessions/session-liveness-reconciler.js'
import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'
import { TmuxClient } from './dist/tmux/tmux-client.js'

const LIVE_SID = 'ses_livecheck001'
const DEAD_SID = 'ses_deadcheck001'
const projectId = 'project-liveness'
const cwd = await mkdtemp(join(tmpdir(), 'termspace-liveness-'))
const tmux = new TmuxClient(new ExecFileProcessRunner())

function session(id) {
  return {
    id,
    projectId,
    name: id,
    agent: 'shell',
    cwd,
    worktreeBranch: null,
    state: 'idle',
    title: null,
    lastActivityAt: 1,
    createdAt: 1,
  }
}

try {
  await tmux.createDetached(LIVE_SID, cwd, ['sh', '-lc', 'sleep 30'])
  await tmux.createDetached(DEAD_SID, cwd, ['sh', '-lc', 'exit 0'])
  await waitUntilAbsent(tmux, DEAD_SID)

  const changes = []
  const activity = new SessionActivityTracker()
  activity.listen((change) => changes.push(change))
  const reconciler = new SessionLivenessReconciler({
    activity,
    sessions: { list: () => [session(LIVE_SID), session(DEAD_SID)] },
    tmux,
  })

  await reconciler.reconcile()

  assert.deepEqual(
    changes.map(({ sessionId, state }) => ({ sessionId, state })),
    [{ sessionId: DEAD_SID, state: 'dead' }],
  )
  console.log('1/1 liveness checks passed against real tmux')
} finally {
  try {
    await tmux.kill(LIVE_SID)
  } catch {
    // The command may have ended on its own while diagnosing a failed check.
  }
  await rm(cwd, { recursive: true, force: true })
}

async function waitUntilAbsent(client, sessionId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!(await client.listSessionIds()).has(sessionId)) {
      return
    }
    await new Promise((resolve) => { setTimeout(resolve, 50) })
  }
  throw new Error(`tmux session ${sessionId} did not exit`)
}

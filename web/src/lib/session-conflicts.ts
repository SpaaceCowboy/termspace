import type { Session } from '@termspace/contracts'

/** Keeps optimistic create/delete updates consistent with the server-derived flag. */
export function withCwdConflicts(sessions: readonly Session[]): Session[] {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    if (session.worktreeBranch === null) {
      counts.set(session.cwd, (counts.get(session.cwd) ?? 0) + 1)
    }
  }
  return sessions.map((session) => ({
    ...session,
    hasCwdConflict:
      session.worktreeBranch === null && (counts.get(session.cwd) ?? 0) > 1,
  }))
}

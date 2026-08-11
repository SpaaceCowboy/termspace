import type { Session, SessionState } from '@termspace/contracts'

/**
 * Worst first. The document title can only say one thing, so it says the thing
 * most likely to make someone switch tabs: a session waiting on a person beats
 * one that died beats one still working.
 *
 * `dead` sits below `needs-you` deliberately — a dead session is over and
 * nothing is waiting, while a prompt is a person being blocked right now.
 */
const SEVERITY: Record<SessionState, number> = {
  'needs-you': 3,
  dead: 2,
  working: 1,
  idle: 0,
}

export function worstState(sessions: readonly Session[]): SessionState | null {
  let worst: SessionState | null = null
  for (const session of sessions) {
    if (worst === null || SEVERITY[session.state] > SEVERITY[worst]) {
      worst = session.state
    }
  }
  return worst
}

export function countNeedingYou(sessions: readonly Session[]): number {
  return sessions.filter((session) => session.state === 'needs-you').length
}

/**
 * What goes in the browser tab. The count leads, because it is legible when the
 * tab is narrow enough that only the first few characters survive.
 */
export function documentTitle(sessions: readonly Session[]): string {
  const waiting = countNeedingYou(sessions)
  if (waiting > 0) {
    return `(${String(waiting)}) Termspace — needs you`
  }
  const worst = worstState(sessions)
  if (worst === 'dead') {
    return 'Termspace — a session ended'
  }
  if (worst === 'working') {
    return 'Termspace — working'
  }
  return 'Termspace'
}

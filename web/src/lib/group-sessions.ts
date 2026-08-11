import type { Project, Session } from '@termspace/contracts'

/** A session whose project is gone still has to be reachable, so it lands here. */
export const ORPHAN_GROUP_ID = ' orphans'

export interface SessionGroup {
  readonly id: string
  readonly name: string
  readonly detail: string | null
  readonly sessions: readonly Session[]
}

/**
 * Every project gets a group even with no sessions — an empty project is where
 * you start a session from, so hiding it would hide the only way in.
 */
export function groupSessionsByProject(
  projects: readonly Project[],
  sessions: readonly Session[],
): readonly SessionGroup[] {
  const byProject = new Map<string, Session[]>()
  for (const session of sessions) {
    const bucket = byProject.get(session.projectId)
    if (bucket === undefined) {
      byProject.set(session.projectId, [session])
    } else {
      bucket.push(session)
    }
  }

  const groups: SessionGroup[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    detail: project.path,
    sessions: byProject.get(project.id) ?? [],
  }))

  const known = new Set(projects.map((project) => project.id))
  const orphans = sessions.filter((session) => !known.has(session.projectId))
  if (orphans.length > 0) {
    groups.push({
      id: ORPHAN_GROUP_ID,
      name: 'Unknown project',
      detail: null,
      sessions: orphans,
    })
  }
  return groups
}

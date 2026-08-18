import type { Favorites, Project, Session } from '@termspace/contracts'

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
  favorites: Favorites = { projectIds: [], sessionIds: [] },
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

  const favoriteSessions = new Set(favorites.sessionIds)
  const favoriteProjects = new Set(favorites.projectIds)
  const sessionOrder = new Map(sessions.map((session, index) => [session.id, index]))
  const groups: SessionGroup[] = projects.map((project) => ({
    id: project.id,
    name: project.name,
    detail: project.path,
    sessions: sortSessions(byProject.get(project.id) ?? [], favoriteSessions, sessionOrder),
  }))

  const known = new Set(projects.map((project) => project.id))
  const orphans = sessions.filter((session) => !known.has(session.projectId))
  if (orphans.length > 0) {
    groups.push({
      id: ORPHAN_GROUP_ID,
      name: 'Unknown project',
      detail: null,
      sessions: sortSessions(orphans, favoriteSessions, sessionOrder),
    })
  }
  const groupOrder = new Map(groups.map((group, index) => [group.id, index]))
  return groups.sort((a, b) => {
    const attention = Number(hasAttention(b)) - Number(hasAttention(a))
    if (attention !== 0) return attention
    const favorite = favoriteRank(b, favoriteProjects, favoriteSessions)
      - favoriteRank(a, favoriteProjects, favoriteSessions)
    return favorite !== 0 ? favorite : (groupOrder.get(a.id) ?? 0) - (groupOrder.get(b.id) ?? 0)
  })
}

function sortSessions(
  sessions: readonly Session[],
  favorites: ReadonlySet<string>,
  order: ReadonlyMap<string, number>,
): readonly Session[] {
  return [...sessions].sort((a, b) => {
    const attention = Number(b.state === 'needs-you') - Number(a.state === 'needs-you')
    if (attention !== 0) return attention
    const favorite = Number(favorites.has(b.id)) - Number(favorites.has(a.id))
    return favorite !== 0 ? favorite : (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  })
}

function hasAttention(group: SessionGroup): boolean {
  return group.sessions.some(({ state }) => state === 'needs-you')
}

function favoriteRank(
  group: SessionGroup,
  projects: ReadonlySet<string>,
  sessions: ReadonlySet<string>,
): number {
  if (projects.has(group.id)) return 2
  return group.sessions.some(({ id }) => sessions.has(id)) ? 1 : 0
}

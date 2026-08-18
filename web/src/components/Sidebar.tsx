'use client'

import type { Favorites, Project, Session, SessionState } from '@termspace/contracts'

import { cx } from '@/lib/cx'
import { ORPHAN_GROUP_ID, groupSessionsByProject } from '@/lib/group-sessions'

import styles from './Sidebar.module.css'

const DOT_CLASS: Record<SessionState, string | undefined> = {
  working: styles.dotWorking,
  idle: undefined,
  'needs-you': styles.dotNeedsYou,
  dead: styles.dotDead,
}

const STATE_LABEL: Record<SessionState, string> = {
  working: 'working',
  idle: 'idle',
  'needs-you': 'needs you',
  dead: 'dead',
}

export interface SidebarProps {
  projects: readonly Project[]
  sessions: readonly Session[]
  favorites: Favorites
  selectedId: string | null
  /** Sessions the layout currently paints, so the sidebar can say where they are. */
  onScreenIds?: ReadonlySet<string>
  onSelect: (sessionId: string) => void
  onNewSession?: (projectId: string | null) => void
  onNewProject?: () => void
  onEditProject?: (projectId: string) => void
  onDeleteProject?: (projectId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onToggleProjectFavorite?: (projectId: string) => void
  onToggleSessionFavorite?: (sessionId: string) => void
  onRetry?: () => void
  loading: boolean
  error: string | null
  sourceKind: string
  mobileOpen?: boolean
  onCloseMobile?: () => void
}

export function Sidebar({
  projects,
  sessions,
  favorites,
  selectedId,
  onScreenIds,
  onSelect,
  onNewSession,
  onNewProject,
  onEditProject,
  onDeleteProject,
  onDeleteSession,
  onToggleProjectFavorite,
  onToggleSessionFavorite,
  onRetry,
  loading,
  error,
  sourceKind,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  return (
    <nav
      id="workspace-sidebar"
      className={cx(styles.sidebar, mobileOpen && styles.sidebarMobileOpen)}
      aria-label="Projects and sessions"
    >
      <h1 className={styles.header}>
        <span className={styles.brandMark}>▌</span>
        Termspace
        {onCloseMobile === undefined ? null : (
          <button
            type="button"
            className={styles.mobileClose}
            onClick={onCloseMobile}
            aria-label="Close sessions menu"
          >
            ×
          </button>
        )}
      </h1>

      {onNewProject !== undefined ? (
        <div className={styles.toolbar}>
          <button type="button" className={styles.newProject} onClick={onNewProject}>
            <span className={styles.newProjectGlyph} aria-hidden="true">
              +
            </span>
            New project
          </button>
        </div>
      ) : null}

      <div className={styles.scroll}>
        <SidebarBody
          projects={projects}
          sessions={sessions}
          favorites={favorites}
          selectedId={selectedId}
          {...(onScreenIds === undefined ? {} : { onScreenIds })}
          onSelect={onSelect}
          {...(onNewSession === undefined ? {} : { onNewSession })}
          {...(onNewProject === undefined ? {} : { onNewProject })}
          {...(onEditProject === undefined ? {} : { onEditProject })}
          {...(onDeleteProject === undefined ? {} : { onDeleteProject })}
          {...(onDeleteSession === undefined ? {} : { onDeleteSession })}
          {...(onToggleProjectFavorite === undefined ? {} : { onToggleProjectFavorite })}
          {...(onToggleSessionFavorite === undefined ? {} : { onToggleSessionFavorite })}
          {...(onRetry === undefined ? {} : { onRetry })}
          loading={loading}
          error={error}
        />
      </div>

      <div className={styles.footer}>
        <span>phase 6</span>
        <span>{sourceKind}</span>
      </div>
    </nav>
  )
}

function SidebarBody({
  projects,
  sessions,
  favorites,
  selectedId,
  onScreenIds,
  onSelect,
  onNewSession,
  onEditProject,
  onDeleteProject,
  onDeleteSession,
  onToggleProjectFavorite,
  onToggleSessionFavorite,
  onRetry,
  loading,
  error,
}: Omit<SidebarProps, 'sourceKind' | 'mobileOpen' | 'onCloseMobile'>) {
  if (loading) {
    return <SidebarSkeleton />
  }

  if (error !== null) {
    return <div className={cx(styles.state, styles.error)} role="alert"><strong>Couldn’t load the workspace</strong><span>{error}</span>{onRetry === undefined ? null : <button type="button" onClick={onRetry}>Try again</button>}</div>
  }

  const groups = groupSessionsByProject(projects, sessions, favorites)
  const favoriteProjects = new Set(favorites.projectIds)
  const favoriteSessions = new Set(favorites.sessionIds)
  if (groups.length === 0) {
    return <p className={styles.state}>No projects yet. Add one to get started.</p>
  }

  return (
    <>
      {groups.map((group) => (
        <section className={styles.group} key={group.id}>
          <h2 className={styles.groupHeader}>
            <span className={styles.groupName} title={group.detail ?? undefined}>
              {group.name}
            </span>
            {group.id === ORPHAN_GROUP_ID ? null : (
              <>
                {onToggleProjectFavorite === undefined ? null : (
                  <button
                    type="button"
                    className={cx(styles.groupAction, favoriteProjects.has(group.id) && styles.favoriteActive)}
                    onClick={() => { onToggleProjectFavorite(group.id) }}
                    aria-label={`${favoriteProjects.has(group.id) ? 'Unpin' : 'Pin'} project ${group.name}`}
                    aria-pressed={favoriteProjects.has(group.id)}
                    title={favoriteProjects.has(group.id) ? 'Unpin project' : 'Pin project'}
                  >
                    <PinIcon filled={favoriteProjects.has(group.id)} />
                  </button>
                )}
                {onEditProject === undefined ? null : (
                  <button
                    type="button"
                    className={styles.groupAction}
                    onClick={() => {
                      onEditProject(group.id)
                    }}
                    aria-label={`Launch commands for ${group.name}`}
                    title="Launch commands"
                  >
                    <GearIcon />
                  </button>
                )}
                {onNewSession === undefined ? null : (
                  <button
                    type="button"
                    className={styles.groupAction}
                    onClick={() => {
                      onNewSession(group.id)
                    }}
                    aria-label={`New session in ${group.name}`}
                  >
                    +
                  </button>
                )}
                {onDeleteProject === undefined ? null : (
                  <button
                    type="button"
                    className={cx(styles.groupAction, styles.groupActionDanger)}
                    onClick={() => {
                      onDeleteProject(group.id)
                    }}
                    aria-label={`Delete project ${group.name}`}
                    title="Delete project"
                  >
                    <TrashIcon />
                  </button>
                )}
              </>
            )}
          </h2>
          {group.sessions.some(({ hasCwdConflict }) => hasCwdConflict) ? (
            <p className={styles.cwdWarning} role="status">
              Sessions in this project share a working directory. Their file changes can collide.
            </p>
          ) : null}
          {group.sessions.length === 0 ? (
            <p className={styles.groupEmpty}>No sessions.</p>
          ) : (
            <ul className={styles.list}>
              {group.sessions.map((session) => (
                <li className={styles.row} key={session.id}>
                  <button
                    type="button"
                    className={cx(
                      styles.item,
                      onScreenIds?.has(session.id) === true && styles.itemOnScreen,
                    )}
                    aria-current={session.id === selectedId}
                    onClick={() => {
                      onSelect(session.id)
                    }}
                  >
                    <span
                      className={cx(styles.dot, DOT_CLASS[session.state])}
                      aria-hidden="true"
                    />
                    <span className={styles.itemText}>
                      <span className={styles.itemName}>{session.name}</span>
                      <span className={styles.itemMeta}>
                        {session.agent} · {STATE_LABEL[session.state]}
                        {onScreenIds?.has(session.id) === true ? ' · on screen' : ''}
                        {session.worktreeBranch === null ? '' : ` · ${session.worktreeBranch}`}
                      </span>
                    </span>
                  </button>
                  <span className={styles.rowActions}>
                    {onToggleSessionFavorite === undefined ? null : (
                      <button
                        type="button"
                        className={cx(styles.itemAction, favoriteSessions.has(session.id) && styles.favoriteActive)}
                        onClick={() => { onToggleSessionFavorite(session.id) }}
                        aria-label={`${favoriteSessions.has(session.id) ? 'Unpin' : 'Pin'} session ${session.name}`}
                        aria-pressed={favoriteSessions.has(session.id)}
                        title={favoriteSessions.has(session.id) ? 'Unpin session' : 'Pin session'}
                      >
                        <PinIcon filled={favoriteSessions.has(session.id)} />
                      </button>
                    )}
                    {onDeleteSession === undefined ? null : (
                      <button
                        type="button"
                        className={cx(styles.itemAction, styles.itemDelete)}
                        onClick={() => { onDeleteSession(session.id) }}
                        aria-label={`Delete session ${session.name}`}
                        title="Delete session"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}

function SidebarSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="Loading projects and sessions">{[0, 1, 2].map((item) => <span key={item} />)}</div>
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M5.2 2.2h5.6l-1 4 2 2v1H8.7V14L8 14.8 7.3 14V9.2H4.2v-1l2-2-1-4Z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * Drawn rather than typed. A dingbat depends on the user's font having the
 * glyph, and when it does not the button is a silent blank square — which is
 * exactly how these two went unnoticed the first time.
 */
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.7 3.3l-1.3 1.3M4.6 11.4l-1.3 1.3M12.7 12.7l-1.3-1.3M4.6 4.6L3.3 3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        d="M3 4.2h10M6.4 4.2V2.9h3.2v1.3M4.4 4.2l.6 8.5h6l.6-8.5M6.7 6.4v4.3M9.3 6.4v4.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

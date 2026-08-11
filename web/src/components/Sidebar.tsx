'use client'

import type { Project, Session, SessionState } from '@termspace/contracts'

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
  selectedId: string | null
  /** Sessions the layout currently paints, so the sidebar can say where they are. */
  onScreenIds?: ReadonlySet<string>
  onSelect: (sessionId: string) => void
  onNewSession?: (projectId: string | null) => void
  onNewProject?: () => void
  onEditProject?: (projectId: string) => void
  onDeleteProject?: (projectId: string) => void
  onDeleteSession?: (sessionId: string) => void
  loading: boolean
  error: string | null
  sourceKind: string
}

export function Sidebar({
  projects,
  sessions,
  selectedId,
  onScreenIds,
  onSelect,
  onNewSession,
  onNewProject,
  onEditProject,
  onDeleteProject,
  onDeleteSession,
  loading,
  error,
  sourceKind,
}: SidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="Projects and sessions">
      <h1 className={styles.header}>
        <span className={styles.brandMark}>▌</span>
        Termspace
      </h1>

      {onNewProject !== undefined ? (
        <div className={styles.toolbar}>
          <button type="button" className={styles.newProject} onClick={onNewProject}>
            + New project
          </button>
        </div>
      ) : null}

      <div className={styles.scroll}>
        <SidebarBody
          projects={projects}
          sessions={sessions}
          selectedId={selectedId}
          {...(onScreenIds === undefined ? {} : { onScreenIds })}
          onSelect={onSelect}
          {...(onNewSession === undefined ? {} : { onNewSession })}
          {...(onNewProject === undefined ? {} : { onNewProject })}
          {...(onEditProject === undefined ? {} : { onEditProject })}
          {...(onDeleteProject === undefined ? {} : { onDeleteProject })}
          {...(onDeleteSession === undefined ? {} : { onDeleteSession })}
          loading={loading}
          error={error}
        />
      </div>

      <div className={styles.footer}>
        <span>phase 2</span>
        <span>{sourceKind}</span>
      </div>
    </nav>
  )
}

function SidebarBody({
  projects,
  sessions,
  selectedId,
  onScreenIds,
  onSelect,
  onNewSession,
  onEditProject,
  onDeleteProject,
  onDeleteSession,
  loading,
  error,
}: Omit<SidebarProps, 'sourceKind'>) {
  if (loading) {
    return (
      <p className={styles.state} role="status">
        Loading projects…
      </p>
    )
  }

  if (error !== null) {
    return (
      <p className={cx(styles.state, styles.error)} role="alert">
        {error}
      </p>
    )
  }

  const groups = groupSessionsByProject(projects, sessions)
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
                      </span>
                    </span>
                  </button>
                  {onDeleteSession === undefined ? null : (
                    <button
                      type="button"
                      className={styles.itemDelete}
                      onClick={() => {
                        onDeleteSession(session.id)
                      }}
                      aria-label={`Delete session ${session.name}`}
                      title="Delete session"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
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

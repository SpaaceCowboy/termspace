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
                    ⚙
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
              </>
            )}
          </h2>
          {group.sessions.length === 0 ? (
            <p className={styles.groupEmpty}>No sessions.</p>
          ) : (
            <ul className={styles.list}>
              {group.sessions.map((session) => (
                <li key={session.id}>
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
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  )
}

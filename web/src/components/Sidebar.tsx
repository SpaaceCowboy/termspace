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
  onSelect: (sessionId: string) => void
  onNewSession?: (projectId: string) => void
  loading: boolean
  error: string | null
  sourceKind: string
}

export function Sidebar({
  projects,
  sessions,
  selectedId,
  onSelect,
  onNewSession,
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

      <div className={styles.scroll}>
        <SidebarBody
          projects={projects}
          sessions={sessions}
          selectedId={selectedId}
          onSelect={onSelect}
          {...(onNewSession === undefined ? {} : { onNewSession })}
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
  onSelect,
  onNewSession,
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
            {onNewSession !== undefined && group.id !== ORPHAN_GROUP_ID ? (
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
            ) : null}
          </h2>
          {group.sessions.length === 0 ? (
            <p className={styles.groupEmpty}>No sessions.</p>
          ) : (
            <ul className={styles.list}>
              {group.sessions.map((session) => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={styles.item}
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

'use client'

import type { Session, SessionState } from '@termspace/contracts'

import { cx } from '@/lib/cx'

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
  sessions: readonly Session[]
  selectedId: string | null
  onSelect: (sessionId: string) => void
  loading: boolean
  error: string | null
  sourceKind: string
}

export function Sidebar({
  sessions,
  selectedId,
  onSelect,
  loading,
  error,
  sourceKind,
}: SidebarProps) {
  return (
    <nav className={styles.sidebar} aria-label="Sessions">
      <h1 className={styles.header}>
        <span className={styles.brandMark}>▌</span>
        Termspace
      </h1>

      <div className={styles.scroll}>
        <div className={styles.group}>
          <h2 className={styles.groupHeader}>Sessions</h2>
          <SidebarBody
            sessions={sessions}
            selectedId={selectedId}
            onSelect={onSelect}
            loading={loading}
            error={error}
          />
        </div>
      </div>

      <div className={styles.footer}>
        <span>phase 0</span>
        <span>{sourceKind}</span>
      </div>
    </nav>
  )
}

function SidebarBody({
  sessions,
  selectedId,
  onSelect,
  loading,
  error,
}: Omit<SidebarProps, 'sourceKind'>) {
  if (loading) {
    return (
      <p className={styles.state} role="status">
        Loading sessions…
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

  if (sessions.length === 0) {
    return <p className={styles.state}>No sessions yet.</p>
  }

  return (
    <ul className={styles.list}>
      {sessions.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            className={styles.item}
            aria-current={session.id === selectedId}
            onClick={() => {
              onSelect(session.id)
            }}
          >
            <span className={cx(styles.dot, DOT_CLASS[session.state])} aria-hidden="true" />
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
  )
}

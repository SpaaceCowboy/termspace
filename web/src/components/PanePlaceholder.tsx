import type { Session, SessionState } from '@termspace/contracts'

import { cx } from '@/lib/cx'

import styles from './PanePlaceholder.module.css'

const PILL_CLASS: Record<SessionState, string | undefined> = {
  working: styles.pillWorking,
  idle: undefined,
  'needs-you': styles.pillNeedsYou,
  dead: styles.pillDead,
}

export interface PanePlaceholderProps {
  session: Session | null
}

export function PanePlaceholder({ session }: PanePlaceholderProps) {
  if (session === null) {
    return (
      <section className={styles.pane} aria-label="Terminal pane">
        <div className={styles.chrome}>
          <span className={styles.name}>no session</span>
        </div>
        <p className={styles.screen}>Select a session to place it in this pane.</p>
      </section>
    )
  }

  return (
    <section className={styles.pane} aria-label={`Terminal pane: ${session.name}`}>
      <div className={styles.chrome}>
        <span className={styles.name}>
          {session.name}
          {session.title !== null ? <span className={styles.title}>— {session.title}</span> : null}
        </span>
        <span className={cx(styles.pill, PILL_CLASS[session.state])}>{session.state}</span>
      </div>
      <p className={styles.screen}>
        {session.cwd}
        {'\n'}
        {`${session.agent} session — no terminal is attached yet.`}
        {'\n\n'}
        <span className={styles.cursor}>▌</span>
      </p>
    </section>
  )
}

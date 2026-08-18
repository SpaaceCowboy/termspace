import { cx } from '@/lib/cx'
import type { ConnectionState } from '@/lib/socket/gateway-client.ts'

import styles from './ConnectionBadge.module.css'

const LABEL: Record<ConnectionState, string> = {
  connecting: 'connecting',
  connected: 'connected',
  reconnecting: 'reconnecting',
  dead: 'disconnected',
}

const DOT_CLASS: Record<ConnectionState, string | undefined> = {
  connecting: styles.dotReconnecting,
  connected: styles.dotConnected,
  reconnecting: styles.dotReconnecting,
  dead: styles.dotDead,
}

export function ConnectionBadge({ state }: { state: ConnectionState }) {
  return (
    <span
      className={cx(styles.badge, state === 'dead' && styles.dead)}
      role="status"
      aria-live="polite"
    >
      <span className={cx(styles.dot, DOT_CLASS[state])} aria-hidden="true" />
      <span className={styles.label}>{LABEL[state]}</span>
    </span>
  )
}

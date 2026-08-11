'use client'

import { cx } from '@/lib/cx'
import type { PushApi } from '@/lib/push/usePush.ts'

import styles from './PushToggle.module.css'

export interface PushToggleProps {
  push: PushApi
  /** False when the server has no VAPID keys; the control is hidden entirely. */
  available: boolean
}

/**
 * Hidden rather than disabled when push cannot work. A permanently greyed-out
 * control is a promise the app cannot keep, and the reasons — no VAPID keys, an
 * insecure origin — are the operator's to fix, not something a button can.
 */
export function PushToggle({ push, available }: PushToggleProps) {
  if (!available || push.permission === 'unsupported') {
    return null
  }

  if (push.permission === 'denied') {
    return (
      <span className={styles.blocked} title="Allow notifications in your browser settings">
        notifications blocked
      </span>
    )
  }

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={cx(styles.toggle, push.subscribed && styles.toggleOn)}
        onClick={() => {
          void (push.subscribed ? push.disable() : push.enable())
        }}
        disabled={push.busy}
        aria-pressed={push.subscribed}
        title={
          push.subscribed
            ? 'This device is notified when a session needs you'
            : 'Get notified on this device when a session needs you'
        }
      >
        <BellIcon on={push.subscribed} />
        {push.busy ? 'saving…' : push.subscribed ? 'notifying' : 'notify me'}
      </button>
      {push.error === null ? null : (
        <span className={styles.error} role="alert">
          {push.error}
        </span>
      )}
    </span>
  )
}

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path
        d="M8 2.2a3.6 3.6 0 0 0-3.6 3.6c0 3-1.2 4-1.2 4h9.6s-1.2-1-1.2-4A3.6 3.6 0 0 0 8 2.2ZM6.7 12.2a1.4 1.4 0 0 0 2.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {on ? null : (
        <path d="M2.6 2.6l10.8 10.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </svg>
  )
}

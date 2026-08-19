'use client'

import { useEffect } from 'react'

import type { NotificationItem } from '@/lib/notification-history.ts'
import { cx } from '@/lib/cx'

import { Dialog } from './Dialog'
import styles from './NotificationCenter.module.css'

export function NotificationCenter({
  open,
  notifications,
  onMarkAllRead,
  onClear,
  onClose,
}: {
  readonly open: boolean
  readonly notifications: readonly NotificationItem[]
  readonly onMarkAllRead: () => void
  readonly onClear: () => void
  readonly onClose: () => void
}) {
  useEffect(() => {
    if (open) onMarkAllRead()
  }, [onMarkAllRead, open])

  return (
    <Dialog open={open} title="Notifications" onClose={onClose}>
      <div className={styles.toolbar}>
        <span>{notifications.length === 0 ? 'No saved notifications' : `${String(notifications.length)} recent`}</span>
        <button type="button" onClick={onClear} disabled={notifications.length === 0}>Clear all</button>
      </div>
      {notifications.length === 0 ? (
        <p className={styles.empty}>Session, connection, layout, and operational messages will remain here after their toast disappears.</p>
      ) : (
        <ol className={styles.list}>
          {notifications.map((notification) => (
            <li key={notification.id} className={cx(styles.item, styles[notification.tone])}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.message}>{notification.message}</span>
              <time dateTime={new Date(notification.createdAt).toISOString()}>
                {formatNotificationTime(notification.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  )
}

function formatNotificationTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp)
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cx } from '@/lib/cx'
import {
  NOTIFICATION_HISTORY_LIMIT,
  NOTIFICATION_STORAGE_KEY,
  type NotificationItem,
  type ToastTone,
  readNotificationHistory,
} from '@/lib/notification-history.ts'

import styles from './ToastRegion.module.css'

export type { ToastTone } from '@/lib/notification-history.ts'

interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
}

export function useToasts() {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const [notifications, setNotifications] = useState<readonly NotificationItem[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const stored = readNotificationHistory(window.localStorage)
    setNotifications(stored)
    nextId.current = Math.max(Date.now(), ...stored.map(({ id }) => id + 1))
    setHistoryLoaded(true)
  }, [])

  useEffect(() => {
    if (!historyLoaded) return
    try {
      window.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications))
    } catch {
      // Keep in-memory history when private mode or quota blocks persistence.
    }
  }, [historyLoaded, notifications])

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    setNotifications((current) => [
      { id, message: message.slice(0, 1_000), tone, createdAt: Date.now(), read: false },
      ...current,
    ].slice(0, NOTIFICATION_HISTORY_LIMIT))
    const duration = tone === 'error' ? 8_000 : 5_000
    timers.current.set(id, setTimeout(() => { dismiss(id) }, duration))
  }, [dismiss])

  const markAllRead = useCallback(() => {
    setNotifications((current) => current.map((notification) => (
      notification.read ? notification : { ...notification, read: true }
    )))
  }, [])

  const clearHistory = useCallback(() => { setNotifications([]) }, [])

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
  }, [])

  return {
    toasts,
    notifications,
    unreadCount: notifications.filter(({ read }) => !read).length,
    push,
    dismiss,
    markAllRead,
    clearHistory,
  }
}

export function ToastRegion({
  toasts,
  onDismiss,
}: {
  readonly toasts: readonly Toast[]
  readonly onDismiss: (id: number) => void
}) {
  return (
    <div className={styles.region} aria-label="Notifications">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(styles.toast, styles[toast.tone])}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{toast.message}</span>
          <button type="button" onClick={() => { onDismiss(toast.id) }} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

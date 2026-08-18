'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cx } from '@/lib/cx'

import styles from './ToastRegion.module.css'

export type ToastTone = 'info' | 'warning' | 'error'

interface Toast {
  readonly id: number
  readonly message: string
  readonly tone: ToastTone
}

export function useToasts() {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    const duration = tone === 'error' ? 8_000 : 5_000
    timers.current.set(id, setTimeout(() => { dismiss(id) }, duration))
  }, [dismiss])

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
  }, [])

  return { toasts, push, dismiss }
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

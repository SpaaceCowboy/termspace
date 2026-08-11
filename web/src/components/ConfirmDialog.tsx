'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { Dialog } from './Dialog'
import styles from './Form.module.css'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  /** What is destroyed, in plain terms. The user is about to lose something. */
  children: ReactNode
  confirmLabel: string
  busyLabel: string
  /** Resolves to an error message, or null when it worked. */
  onConfirm: () => Promise<string | null>
  onClose: () => void
}

/**
 * Destructive confirmation. The error is shown here rather than dismissing and
 * surfacing it elsewhere, because a failed delete is exactly the moment the
 * user needs to still be looking at what they tried to delete.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busyLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A reopen must not show the previous attempt's failure.
  useEffect(() => {
    if (!open) {
      return
    }
    setError(null)
    setBusy(false)
  }, [open])

  async function confirm(): Promise<void> {
    if (busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const failure = await onConfirm()
      if (failure !== null) {
        setError(failure)
        return
      }
      onClose()
    } catch {
      setError('Could not reach the Termspace server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <div className={styles.form}>
        {children}

        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.danger)}
            onClick={() => {
              void confirm()
            }}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

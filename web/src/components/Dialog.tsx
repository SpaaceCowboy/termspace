'use client'

import { useEffect, useRef, type ReactNode } from 'react'

import styles from './Dialog.module.css'

export interface DialogProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * The native `<dialog>` with `showModal()`, so focus containment, restoring
 * focus on close, `Escape`, and inertness of the page behind it are the
 * browser's job rather than ours. Nothing here is a component library.
 */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) {
      return
    }
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) {
      return
    }
    // `cancel` is Escape. Let it through, but route it via onClose so the parent
    // stays the single owner of open state.
    const onCancel = (event: Event): void => {
      event.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => {
      dialog.removeEventListener('cancel', onCancel)
    }
  }, [onClose])

  return (
    <dialog
      className={styles.dialog}
      ref={ref}
      aria-label={title}
      onClick={(event) => {
        // Clicking the backdrop lands on the dialog element itself.
        if (event.target === ref.current) {
          onClose()
        }
      }}
    >
      <div className={styles.body}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

'use client'

import { EMPTY_LAYOUT, type LayoutInput } from '@termspace/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'

import { dataSource } from '@/lib/data'

import { layoutEquals } from './layout-actions.ts'

/** Arranging panes is a burst of small changes; one write per burst is enough. */
const SAVE_DEBOUNCE_MS = 400

const EMPTY: LayoutInput = {
  mode: EMPTY_LAYOUT.mode,
  slots: EMPTY_LAYOUT.slots,
  focusedSlot: EMPTY_LAYOUT.focusedSlot,
}

export interface LayoutApi {
  layout: LayoutInput
  loading: boolean
  /** Non-null when the arrangement on screen is not the one on the server. */
  saveError: string | null
  apply: (mutate: (current: LayoutInput) => LayoutInput) => void
}

/**
 * The layout on screen, kept in sync with `GET`/`PUT /api/layouts`. Edits are
 * applied locally at once and written back debounced: the grid must never wait
 * on a round trip to redraw.
 */
export function useLayout(enabled: boolean): LayoutApi {
  const [layout, setLayout] = useState<LayoutInput>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)
  const latest = useRef<LayoutInput>(EMPTY)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }
    const controller = new AbortController()
    dataSource
      .layout(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return
        }
        if (response.ok) {
          const { updatedAt: _stamp, ...stored } = response.data
          latest.current = stored
          setLayout(stored)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          // An unreachable layout endpoint is not a reason to show no
          // workspace: the empty layout is a working starting point.
          setLoading(false)
        }
      })
    return () => {
      controller.abort()
    }
  }, [enabled])

  useEffect(() => {
    return () => {
      if (timer.current !== null) {
        clearTimeout(timer.current)
      }
    }
  }, [])

  const apply = useCallback((mutate: (current: LayoutInput) => LayoutInput) => {
    const next = mutate(latest.current)
    if (layoutEquals(latest.current, next)) {
      return
    }
    latest.current = next
    setLayout(next)

    if (timer.current !== null) {
      clearTimeout(timer.current)
    }
    timer.current = setTimeout(() => {
      timer.current = null
      dataSource
        .saveLayout(latest.current)
        .then((response) => {
          setSaveError(response.ok ? null : response.error.message)
        })
        .catch(() => {
          setSaveError('Could not save this layout.')
        })
    }, SAVE_DEBOUNCE_MS)
  }, [])

  return { layout, loading, saveError, apply }
}

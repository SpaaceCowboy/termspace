'use client'

import {
  LAYOUT_SLOT_CAPACITY,
  type LayoutInput,
  type Session,
  type SessionState,
} from '@termspace/contracts'
import { useCallback, useEffect, useMemo } from 'react'

import { cx } from '@/lib/cx'
import type { PaneSlot, PanesApi } from '@/lib/panes/usePanes.ts'

import { PanePlaceholder } from './PanePlaceholder'
import styles from './TerminalGrid.module.css'

/** `single` and `tabs` paint one pane, which the base grid already does. */
const MODE_CLASS: Record<LayoutInput['mode'], string | undefined> = {
  single: undefined,
  split: styles.modeSplit,
  grid: styles.modeGrid,
  tabs: undefined,
}

const PILL_CLASS: Record<SessionState, string | undefined> = {
  working: styles.pillWorking,
  idle: undefined,
  'needs-you': styles.pillNeedsYou,
  dead: styles.pillDead,
}

export interface TerminalGridProps {
  layout: LayoutInput
  sessions: readonly Session[]
  panes: PanesApi
  /** False on the fixture source, where there is no gateway to attach to. */
  live: boolean
  deadSessions: ReadonlySet<string>
  notice: string | null
  onFocusSlot: (index: number) => void
  onClearSlot: (index: number) => void
  onNewSession: () => void
}

export function TerminalGrid({
  layout,
  sessions,
  panes,
  live,
  deadSessions,
  notice,
  onFocusSlot,
  onClearSlot,
  onNewSession,
}: TerminalGridProps) {
  const capacity = LAYOUT_SLOT_CAPACITY[layout.mode]
  const tabbed = layout.mode === 'tabs'

  const byId = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions],
  )

  /**
   * What the store is told to hold. In `tabs` every slot but the selected one
   * stays subscribed with no container, which is what keeps its terminal
   * headless and its screen current.
   */
  const paneSlots = useMemo<readonly PaneSlot[]>(() => {
    const requests: PaneSlot[] = []
    for (let index = 0; index < capacity; index += 1) {
      const sid = layout.slots[index] ?? null
      if (sid === null || !byId.has(sid)) {
        continue
      }
      const focused = index === layout.focusedSlot
      requests.push({
        sid,
        visibility: focused ? 'focused' : tabbed ? 'hidden' : 'visible',
        onScreen: !tabbed || focused,
      })
    }
    return requests
  }, [byId, capacity, layout.focusedSlot, layout.slots, tabbed])

  useEffect(() => {
    if (!live) {
      return
    }
    panes.setSlots(paneSlots)
  }, [live, paneSlots, panes])

  const visibleIndices = useMemo(() => {
    const indices: number[] = []
    for (let index = 0; index < capacity; index += 1) {
      if (!tabbed || index === layout.focusedSlot) {
        indices.push(index)
      }
    }
    return indices
  }, [capacity, layout.focusedSlot, tabbed])

  const occupiedIndices = useMemo(() => {
    const indices: number[] = []
    for (let index = 0; index < capacity; index += 1) {
      if ((layout.slots[index] ?? null) !== null) {
        indices.push(index)
      }
    }
    return indices
  }, [capacity, layout.slots])

  return (
    <div className={styles.wrap}>
      {tabbed ? (
        <div className={styles.tabs} role="group" aria-label="Open panes">
          {occupiedIndices.length === 0 ? (
            <span className={styles.tabsEmpty}>No panes open</span>
          ) : (
            occupiedIndices.map((index) => {
              const sid = layout.slots[index] ?? ''
              const session = byId.get(sid)
              return (
                <button
                  key={sid}
                  type="button"
                  className={cx(styles.tab, index === layout.focusedSlot && styles.tabActive)}
                  aria-pressed={index === layout.focusedSlot}
                  onClick={() => {
                    onFocusSlot(index)
                  }}
                >
                  {session?.name ?? 'Unknown session'}
                </button>
              )
            })
          )}
        </div>
      ) : null}

      <div className={cx(styles.grid, MODE_CLASS[layout.mode])}>
        {visibleIndices.map((index) => {
          const sid = layout.slots[index] ?? null
          const session = sid === null ? null : (byId.get(sid) ?? null)
          return (
            <PaneSlotFrame
              key={index}
              index={index}
              session={session}
              focused={index === layout.focusedSlot}
              live={live}
              dead={session !== null && deadSessions.has(session.id)}
              notice={index === layout.focusedSlot ? notice : null}
              setContainer={panes.setContainer}
              onFocusSlot={onFocusSlot}
              onClearSlot={onClearSlot}
              onNewSession={onNewSession}
            />
          )
        })}
      </div>
    </div>
  )
}

interface PaneSlotFrameProps {
  index: number
  session: Session | null
  focused: boolean
  live: boolean
  dead: boolean
  notice: string | null
  setContainer: PanesApi['setContainer']
  onFocusSlot: (index: number) => void
  onClearSlot: (index: number) => void
  onNewSession: () => void
}

function PaneSlotFrame({
  index,
  session,
  focused,
  live,
  dead,
  notice,
  setContainer,
  onFocusSlot,
  onClearSlot,
  onNewSession,
}: PaneSlotFrameProps) {
  const sid = session?.id ?? null

  // Stable per session, so React does not detach the container on every render.
  const attach = useCallback(
    (element: HTMLDivElement | null) => {
      if (sid === null) {
        return
      }
      setContainer(sid, element)
    },
    [sid, setContainer],
  )

  if (session === null) {
    return (
      <section
        className={cx(styles.pane, styles.paneEmpty, focused && styles.paneFocused)}
        aria-label={`Empty pane ${String(index + 1)}`}
        onFocus={() => {
          onFocusSlot(index)
        }}
      >
        <p className={styles.emptyText}>
          {focused
            ? 'Pick a session in the sidebar to show it here.'
            : 'Empty pane.'}
        </p>
        <div className={styles.emptyActions}>
          {focused ? null : (
            <button
              type="button"
              className={styles.emptyButton}
              onClick={() => {
                onFocusSlot(index)
              }}
            >
              Fill this pane next
            </button>
          )}
          <button type="button" className={styles.emptyButton} onClick={onNewSession}>
            New session
          </button>
        </div>
      </section>
    )
  }

  return (
    <section
      className={cx(styles.pane, focused && styles.paneFocused)}
      aria-label={`Terminal: ${session.name}`}
      onFocus={() => {
        onFocusSlot(index)
      }}
    >
      <div className={styles.chrome}>
        <span className={styles.name}>
          {session.name}
          {session.title !== null ? <span className={styles.title}>— {session.title}</span> : null}
        </span>
        <span className={styles.chromeRight}>
          <span className={cx(styles.pill, PILL_CLASS[dead ? 'dead' : session.state])}>
            {dead ? 'dead' : session.state}
          </span>
          <button
            type="button"
            className={styles.close}
            aria-label={`Remove ${session.name} from this pane`}
            title="Remove from this pane (the session keeps running)"
            onClick={() => {
              onClearSlot(index)
            }}
          >
            ×
          </button>
        </span>
      </div>
      {live ? (
        <div className={styles.screen} ref={attach} />
      ) : (
        <div className={styles.screen}>
          <PanePlaceholder session={session} />
        </div>
      )}
      {notice !== null ? (
        <p className={cx(styles.notice, dead && styles.noticeDead)} role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

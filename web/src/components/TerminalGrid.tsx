'use client'

import {
  LAYOUT_SLOT_CAPACITY,
  type LayoutInput,
  type Session,
  type SessionState,
} from '@termspace/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'


import { cx } from '@/lib/cx'
import type { PaneSlot, PanesApi } from '@/lib/panes/usePanes.ts'
import {
  adjacentOccupiedSlot,
  occupiedSlotIndices,
  swipeDirection,
} from '@/lib/panes/mobile-navigation.ts'

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
  mobile?: boolean
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
  mobile = false,
}: TerminalGridProps) {
  const capacity = LAYOUT_SLOT_CAPACITY[layout.mode]
  const tabbed = layout.mode === 'tabs'
  const [controlArmed, setControlArmed] = useState(false)
  const touchStart = useRef<{ x: number; y: number } | null>(null)

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
        visibility: focused ? 'focused' : tabbed || mobile ? 'hidden' : 'visible',
        onScreen: (!tabbed && !mobile) || focused,
      })
    }
    return requests
  }, [byId, capacity, layout.focusedSlot, layout.slots, mobile, tabbed])

  useEffect(() => {
    if (!live) {
      return
    }
    panes.setSlots(paneSlots)
  }, [live, paneSlots, panes])

  const visibleIndices = useMemo(() => {
    const indices: number[] = []
    for (let index = 0; index < capacity; index += 1) {
      if ((!tabbed && !mobile) || index === layout.focusedSlot) {
        indices.push(index)
      }
    }
    return indices
  }, [capacity, layout.focusedSlot, mobile, tabbed])

  const occupiedIndices = useMemo(() => {
    return occupiedSlotIndices(layout)
  }, [layout])

  const previous = adjacentOccupiedSlot(layout, -1)
  const next = adjacentOccupiedSlot(layout, 1)
  const focusedSid = layout.slots[layout.focusedSlot] ?? null

  useEffect(() => {
    setControlArmed(false)
  }, [focusedSid])

  useEffect(() => {
    if (!controlArmed || focusedSid === null) return
    const timer = setTimeout(() => {
      setControlArmed(false)
      panes.setControlArmed(focusedSid, false)
    }, 5_000)
    return () => { clearTimeout(timer) }
  }, [controlArmed, focusedSid, panes])

  const sendKey = useCallback((data: string) => {
    if (focusedSid === null) return
    panes.sendInput(focusedSid, data)
    panes.focus(focusedSid)
    setControlArmed(false)
  }, [focusedSid, panes])

  const navigate = useCallback((direction: -1 | 1) => {
    const target = adjacentOccupiedSlot(layout, direction)
    if (target !== null) onFocusSlot(target)
  }, [layout, onFocusSlot])

  return (
    <div className={styles.wrap}>
      {tabbed && !mobile ? (
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

      {mobile && occupiedIndices.length > 1 ? (
        <div className={styles.mobileNavigator} aria-label="Session navigation">
          <button type="button" disabled={previous === null} onClick={() => { navigate(-1) }}>
            ‹ <span className={styles.srOnly}>Previous session</span>
          </button>
          <span>{String(occupiedIndices.indexOf(layout.focusedSlot) + 1)} / {String(occupiedIndices.length)}</span>
          <button type="button" disabled={next === null} onClick={() => { navigate(1) }}>
            <span className={styles.srOnly}>Next session</span> ›
          </button>
        </div>
      ) : null}

      <div
        className={cx(styles.grid, !mobile && MODE_CLASS[layout.mode])}
        onTouchStart={(event) => {
          const touch = event.changedTouches[0]
          touchStart.current = touch === undefined ? null : { x: touch.clientX, y: touch.clientY }
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current
          const touch = event.changedTouches[0]
          touchStart.current = null
          if (!mobile || start === null || touch === undefined) return
          const direction = swipeDirection(start, { x: touch.clientX, y: touch.clientY })
          if (direction !== null) navigate(direction)
        }}
      >
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
              focusTerminal={panes.focus}
              onFocusSlot={onFocusSlot}
              onClearSlot={onClearSlot}
              onNewSession={onNewSession}
            />
          )
        })}
      </div>
      {mobile && focusedSid !== null ? (
        <div className={styles.accessoryBar} role="toolbar" aria-label="Terminal keys">
          <AccessoryKey label="Esc" onPress={() => { sendKey('\x1b') }} />
          <AccessoryKey
            label="Ctrl"
            pressed={controlArmed}
            onPress={() => {
              const armed = !controlArmed
              setControlArmed(armed)
              panes.setControlArmed(focusedSid, armed)
              panes.focus(focusedSid)
            }}
          />
          <AccessoryKey label="Tab" onPress={() => { sendKey('\t') }} />
          <AccessoryKey label="←" accessibleLabel="Left arrow" onPress={() => { sendKey('\x1b[D') }} />
          <AccessoryKey label="↑" accessibleLabel="Up arrow" onPress={() => { sendKey('\x1b[A') }} />
          <AccessoryKey label="↓" accessibleLabel="Down arrow" onPress={() => { sendKey('\x1b[B') }} />
          <AccessoryKey label="→" accessibleLabel="Right arrow" onPress={() => { sendKey('\x1b[C') }} />
          <AccessoryKey label="/" onPress={() => { sendKey('/') }} />
          <AccessoryKey label="|" onPress={() => { sendKey('|') }} />
          <AccessoryKey label="Ctrl+C" destructive onPress={() => { sendKey('\x03') }} />
          <AccessoryKey label="Ctrl+D" destructive onPress={() => { sendKey('\x04') }} />
        </div>
      ) : null}
    </div>
  )
}

function AccessoryKey({
  label,
  accessibleLabel,
  pressed = false,
  destructive = false,
  onPress,
}: {
  label: string
  accessibleLabel?: string
  pressed?: boolean
  destructive?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      className={cx(styles.accessoryKey, pressed && styles.accessoryKeyActive, destructive && styles.accessoryKeyDanger)}
      aria-label={accessibleLabel ?? label}
      aria-pressed={label === 'Ctrl' ? pressed : undefined}
      onPointerDown={(event) => { event.preventDefault() }}
      onClick={onPress}
    >
      {label}
    </button>
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
  focusTerminal: PanesApi['focus']
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
  focusTerminal,
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

  /**
   * The focused slot owns the keyboard. Without this the terminal renders but
   * never receives a keystroke, because xterm reads from a hidden textarea that
   * nothing else ever focuses.
   */
  useEffect(() => {
    if (!live || sid === null || !focused) {
      return
    }
    focusTerminal(sid)
  }, [focused, focusTerminal, live, sid])

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
        <div
          className={styles.screen}
          ref={attach}
          onMouseDown={() => {
            onFocusSlot(index)
            if (sid !== null) {
              focusTerminal(sid)
            }
          }}
        />
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

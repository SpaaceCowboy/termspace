'use client'

import type { VisibilityLevel } from '@termspace/contracts'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { SocketApi } from '@/lib/socket/useSocket.ts'
import type { TerminalAppearance } from '@/lib/appearance.ts'

import { PaneStore, type PaneRequest } from './pane-store.ts'
import { createXtermPaneTerminal } from './xterm-pane-terminal.ts'

/** What the layout asks for, before the DOM has been consulted. */
export interface PaneSlot {
  readonly sid: string
  readonly visibility: VisibilityLevel
  /** False for a pane the layout keeps but does not paint — an unselected tab. */
  readonly onScreen: boolean
}

export interface PanesApi {
  /** Called from a ref callback as slots mount and unmount. */
  setContainer: (sid: string, element: HTMLElement | null) => void
  setSlots: (slots: readonly PaneSlot[]) => void
  restore: (sid: string, data: string) => void
  write: (sid: string, bytes: Uint8Array) => void
  /** Hands the keyboard to a pane's terminal. */
  focus: (sid: string) => void
  sendInput: (sid: string, data: string) => void
  setControlArmed: (sid: string, armed: boolean) => void
}

/**
 * Holds the one `PaneStore` for the page. Terminals live in it rather than in
 * the components, so re-rendering the grid, changing mode, or switching tabs
 * never detaches a session.
 */
export function usePanes(
  socket: SocketApi,
  enabled: boolean,
  onError?: (error: unknown) => void,
  onDestructiveInputArmed?: (sid: string, label: string) => void,
  terminalAppearance: TerminalAppearance = { theme: 'midnight', fontSize: 13 },
): PanesApi {
  const storeRef = useRef<PaneStore | null>(null)
  const containers = useRef(new Map<string, HTMLElement>())
  const slots = useRef<readonly PaneSlot[]>([])
  const documentHidden = useRef(false)

  const socketRef = useRef(socket)
  socketRef.current = socket
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onDestructiveInputArmedRef = useRef(onDestructiveInputArmed)
  onDestructiveInputArmedRef.current = onDestructiveInputArmed

  const requests = useCallback((): readonly PaneRequest[] => {
    return slots.current.map((slot) => ({
      sid: slot.sid,
      // A backgrounded tab is hidden as far as the server's coalescing is
      // concerned, whatever the layout says is focused.
      visibility: documentHidden.current ? 'hidden' : slot.visibility,
      container: slot.onScreen ? (containers.current.get(slot.sid) ?? null) : null,
    }))
  }, [])

  const resync = useCallback(() => {
    storeRef.current?.sync(requests())
  }, [requests])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const store = new PaneStore({
      createTerminal: createXtermPaneTerminal,
      socket: {
        subscribe: (sid, level) => {
          socketRef.current.subscribe(sid, level)
        },
        unsubscribe: (sid) => {
          socketRef.current.unsubscribe(sid)
        },
        sendInput: (sid, data) => {
          socketRef.current.sendInput(sid, data)
        },
        sendResize: (sid, cols, rows) => {
          socketRef.current.sendResize(sid, cols, rows)
        },
        sendVisibility: (sid, level) => {
          socketRef.current.sendVisibility(sid, level)
        },
      },
      onError: (error) => {
        onErrorRef.current?.(error)
      },
      onDestructiveInputArmed: (sid, label) => {
        onDestructiveInputArmedRef.current?.(sid, label)
      },
      terminalAppearance,
    })
    storeRef.current = store
    store.sync(requests())

    const onVisibilityChange = (): void => {
      documentHidden.current = document.visibilityState !== 'visible'
      resync()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      storeRef.current = null
      store.dispose()
    }
  }, [enabled, requests, resync])

  useEffect(() => {
    storeRef.current?.setTerminalAppearance(terminalAppearance)
  }, [terminalAppearance])

  useEffect(() => {
    storeRef.current?.setConnected(socket.state === 'connected')
  }, [socket.state])

  const setContainer = useCallback(
    (sid: string, element: HTMLElement | null) => {
      if (element === null) {
        containers.current.delete(sid)
      } else {
        if (containers.current.get(sid) === element) {
          return
        }
        containers.current.set(sid, element)
      }
      resync()
    },
    [resync],
  )

  const setSlots = useCallback(
    (next: readonly PaneSlot[]) => {
      slots.current = next
      resync()
    },
    [resync],
  )

  const restore = useCallback((sid: string, data: string) => {
    storeRef.current?.restore(sid, data)
  }, [])

  const write = useCallback((sid: string, bytes: Uint8Array) => {
    storeRef.current?.write(sid, bytes)
  }, [])

  const focus = useCallback((sid: string) => {
    storeRef.current?.focus(sid)
  }, [])

  const sendInput = useCallback((sid: string, data: string) => {
    storeRef.current?.sendInput(sid, data)
  }, [])

  const setControlArmed = useCallback((sid: string, armed: boolean) => {
    storeRef.current?.setControlArmed(sid, armed)
  }, [])

  return useMemo(
    () => ({ setContainer, setSlots, restore, write, focus, sendInput, setControlArmed }),
    [setContainer, setSlots, restore, write, focus, sendInput, setControlArmed],
  )
}

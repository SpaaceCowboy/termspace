'use client'

import type { ServerFrame, VisibilityLevel } from '@termspace/contracts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { dataSource } from '@/lib/data'

import { GatewayClient, type ConnectionState, type SocketLike } from './gateway-client.ts'

function socketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_TERMSPACE_WS_URL
  if (configured !== undefined && configured !== '') {
    return configured
  }
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${globalThis.location.host}/ws`
}

export interface SocketHandlers {
  onFrame?: (frame: ServerFrame) => void
  onOutput?: (sid: string, bytes: Uint8Array) => void
}

export interface SocketApi {
  state: ConnectionState
  reconnect: () => void
  reattach: (sid: string) => void
  subscribe: (sid: string, level?: VisibilityLevel) => void
  unsubscribe: (sid: string) => void
  sendInput: (sid: string, data: string) => void
  sendResize: (sid: string, cols: number, rows: number) => void
  sendVisibility: (sid: string, level: VisibilityLevel) => void
}

/**
 * One client for the whole page. Handlers are held in a ref so a re-render
 * never tears down the socket — a new socket means a new ticket and a fresh
 * restore for every pane.
 */
export function useSocket(handlers: SocketHandlers, enabled = true): SocketApi {
  const [state, setState] = useState<ConnectionState>('connecting')
  const clientRef = useRef<GatewayClient | null>(null)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) {
      return
    }

    const client = new GatewayClient({
      requestTicket: async () => {
        const response = await dataSource.wsTicket()
        if (response.ok) {
          return { ok: true, ticket: response.data.ticket }
        }
        return { ok: false, fatal: response.error.code === 'unauthorized' }
      },
      socketUrl: socketUrl(),
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      onState: setState,
      onFrame: (frame) => handlersRef.current.onFrame?.(frame),
      onOutput: (sid, bytes) => handlersRef.current.onOutput?.(sid, bytes),
    })

    clientRef.current = client
    client.connect()

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        client.reconnect()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clientRef.current = null
      client.dispose()
    }
  }, [enabled])

  const subscribe = useCallback((sid: string, level: VisibilityLevel = 'visible') => {
    clientRef.current?.subscribe(sid, level)
  }, [])

  const reconnect = useCallback(() => {
    clientRef.current?.reconnect()
  }, [])

  const unsubscribe = useCallback((sid: string) => {
    clientRef.current?.unsubscribe(sid)
  }, [])

  const reattach = useCallback((sid: string) => {
    clientRef.current?.reattach(sid)
  }, [])

  const sendInput = useCallback((sid: string, data: string) => {
    clientRef.current?.sendInput(sid, data)
  }, [])

  const sendResize = useCallback((sid: string, cols: number, rows: number) => {
    clientRef.current?.sendResize(sid, cols, rows)
  }, [])

  const sendVisibility = useCallback((sid: string, level: VisibilityLevel) => {
    clientRef.current?.sendVisibility(sid, level)
  }, [])

  return useMemo(
    () => ({ state, reconnect, reattach, subscribe, unsubscribe, sendInput, sendResize, sendVisibility }),
    [state, reconnect, reattach, subscribe, unsubscribe, sendInput, sendResize, sendVisibility],
  )
}

'use client'

import type { ServerFrame, Session } from '@termspace/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ConnectionBadge } from '@/components/ConnectionBadge'
import { PanePlaceholder } from '@/components/PanePlaceholder'
import { Sidebar } from '@/components/Sidebar'
import { TerminalPane, type PaneHandle } from '@/components/TerminalPane'
import { dataSource } from '@/lib/data'
import { useSocket } from '@/lib/socket/useSocket.ts'

import styles from './workspace.module.css'

type AuthState = 'checking' | 'authenticated' | 'anonymous'

export default function WorkspacePage() {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthState>('checking')
  const [sessions, setSessions] = useState<readonly Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deadSessions, setDeadSessions] = useState<ReadonlySet<string>>(new Set())

  const panesRef = useRef(new Map<string, PaneHandle>())

  const registerPane = useCallback((sid: string, handle: PaneHandle | null) => {
    if (handle === null) {
      panesRef.current.delete(sid)
      return
    }
    panesRef.current.set(sid, handle)
  }, [])

  const onFrame = useCallback((frame: ServerFrame) => {
    switch (frame.t) {
      case 'restore':
        panesRef.current.get(frame.sid)?.restore(frame.data)
        setNotice(null)
        return
      case 'truncated':
        setNotice('Output was truncated to keep up. The screen was resynced.')
        return
      case 'exit':
        setDeadSessions((current) => new Set(current).add(frame.sid))
        setNotice(
          frame.code === null
            ? 'The session ended.'
            : `The session exited with code ${String(frame.code)}.`,
        )
        return
      case 'status':
        setSessions((current) =>
          current.map((session) =>
            session.id === frame.sid ? { ...session, state: frame.state } : session,
          ),
        )
        return
      case 'title':
        setSessions((current) =>
          current.map((session) =>
            session.id === frame.sid ? { ...session, title: frame.title } : session,
          ),
        )
        return
      case 'error':
        setNotice(frame.message)
        return
      case 'pong':
        return
    }
  }, [])

  const onOutput = useCallback((sid: string, bytes: Uint8Array) => {
    panesRef.current.get(sid)?.write(bytes)
  }, [])

  const live = dataSource.kind === 'http'
  const socket = useSocket({ onFrame, onOutput }, live && auth === 'authenticated')

  useEffect(() => {
    const controller = new AbortController()
    dataSource
      .me(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return
        }
        if (response.ok) {
          setAuth('authenticated')
          return
        }
        setAuth('anonymous')
        router.replace('/login')
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAuth('anonymous')
        }
      })
    return () => {
      controller.abort()
    }
  }, [router])

  useEffect(() => {
    if (auth !== 'authenticated') {
      return
    }
    const controller = new AbortController()
    setLoading(true)
    dataSource
      .listSessions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return
        }
        if (!response.ok) {
          setError(response.error.message)
          setSessions([])
          return
        }
        setError(null)
        setSessions(response.data)
        setSelectedId((current) => current ?? response.data[0]?.id ?? null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load sessions.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })
    return () => {
      controller.abort()
    }
  }, [auth])

  const selected = sessions.find((session) => session.id === selectedId) ?? null

  if (auth !== 'authenticated') {
    return (
      <main className={styles.gate}>
        <p role="status">
          {auth === 'checking' ? 'Checking your session…' : 'Redirecting to sign in…'}
        </p>
      </main>
    )
  }

  return (
    <div className={styles.shell}>
      <a className="ts-skip-link" href="#workspace-main">
        Skip to terminals
      </a>
      <Sidebar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
        error={error}
        sourceKind={dataSource.kind}
      />
      <main className={styles.main} id="workspace-main">
        <div className={styles.topbar}>
          <p className={styles.crumbs}>
            workspace / <span className={styles.crumbCurrent}>{selected?.name ?? 'no session'}</span>
          </p>
          <ConnectionBadge state={socket.state} />
        </div>
        <div className={styles.grid}>
          {selected === null ? (
            <p className={styles.empty}>
              {loading ? 'Loading sessions…' : 'No session selected.'}
            </p>
          ) : !live ? (
            <PanePlaceholder session={selected} />
          ) : (
            <TerminalPane
              key={selected.id}
              session={selected}
              socket={socket}
              register={registerPane}
              notice={socket.state === 'dead' ? 'Disconnected. Reload to reconnect.' : notice}
              dead={deadSessions.has(selected.id)}
            />
          )}
        </div>
      </main>
    </div>
  )
}

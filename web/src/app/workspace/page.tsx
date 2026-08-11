'use client'

import type { LayoutMode, Project, ServerFrame, Session } from '@termspace/contracts'
import { normalizeLayout } from '@termspace/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConnectionBadge } from '@/components/ConnectionBadge'
import { LayoutToolbar } from '@/components/LayoutToolbar'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { NewSessionDialog } from '@/components/NewSessionDialog'
import { Sidebar } from '@/components/Sidebar'
import { TerminalGrid } from '@/components/TerminalGrid'
import { dataSource } from '@/lib/data'
import {
  clearSlot,
  focusSlot,
  liveSessionIds,
  setMode,
  showSession,
} from '@/lib/layout/layout-actions.ts'
import { useLayout } from '@/lib/layout/useLayout.ts'
import { usePanes, type PanesApi } from '@/lib/panes/usePanes.ts'
import { useSocket } from '@/lib/socket/useSocket.ts'

import styles from './workspace.module.css'

type AuthState = 'checking' | 'authenticated' | 'anonymous'

export default function WorkspacePage() {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthState>('checking')
  const [projects, setProjects] = useState<readonly Project[]>([])
  const [sessions, setSessions] = useState<readonly Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deadSessions, setDeadSessions] = useState<ReadonlySet<string>>(new Set())
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [sessionDialogFor, setSessionDialogFor] = useState<string | null>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)

  const live = dataSource.kind === 'http'
  const authenticated = auth === 'authenticated'
  const { layout, saveError, apply } = useLayout(authenticated)

  // The socket handlers and the pane store need each other: frames feed the
  // store, and the store sends on the socket. The ref is what breaks the knot.
  const panesRef = useRef<PanesApi | null>(null)

  const onFrame = useCallback(
    (frame: ServerFrame) => {
      switch (frame.t) {
        case 'restore':
          panesRef.current?.restore(frame.sid, frame.data)
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
    },
    [],
  )

  const onOutput = useCallback((sid: string, bytes: Uint8Array) => {
    panesRef.current?.write(sid, bytes)
  }, [])

  const socket = useSocket({ onFrame, onOutput }, live && authenticated)
  const panes = usePanes(socket, live && authenticated)
  panesRef.current = panes

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
    if (!authenticated) {
      return
    }
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      dataSource.listProjects(controller.signal),
      dataSource.listSessions(controller.signal),
      dataSource.config(controller.signal),
    ])
      .then(([projectResponse, sessionResponse, configResponse]) => {
        if (controller.signal.aborted) {
          return
        }
        // Sessions are what the grid renders, so a projects failure alone must
        // not blank the workspace — the sidebar falls back to one unknown group.
        if (!sessionResponse.ok) {
          setError(sessionResponse.error.message)
          setProjects([])
          setSessions([])
          return
        }
        setProjectRoot(configResponse.ok ? configResponse.data.projectRoot : null)
        setError(projectResponse.ok ? null : projectResponse.error.message)
        setProjects(projectResponse.ok ? projectResponse.data : [])
        setSessions(sessionResponse.data)

        const known = new Set(sessionResponse.data.map((session) => session.id))
        apply((current) => {
          const pruned = normalizeLayout(current, { knownSessionIds: known })
          // A layout with nothing in it is not a layout anyone chose; put the
          // first session on screen rather than opening on an empty grid.
          const first = sessionResponse.data[0]
          return liveSessionIds(pruned).length === 0 && first !== undefined
            ? showSession(pruned, first.id)
            : pruned
        })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load the workspace.')
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
  }, [apply, authenticated])

  const openSessionDialog = useCallback((forProjectId: string | null) => {
    setSessionDialogFor(forProjectId)
    setSessionDialogOpen(true)
  }, [])

  const onSessionCreated = useCallback(
    (session: Session) => {
      setSessions((current) => [...current, session])
      apply((current) => showSession(current, session.id))
      setSessionDialogOpen(false)
    },
    [apply],
  )

  const onProjectCreated = useCallback((project: Project) => {
    setProjects((current) => [...current, project])
    setProjectDialogOpen(false)
    // A project with no sessions is not much use, so go straight on to the
    // thing you actually came to do.
    setSessionDialogFor(project.id)
    setSessionDialogOpen(true)
  }, [])

  const onSelectSession = useCallback(
    (sid: string) => {
      apply((current) => showSession(current, sid))
    },
    [apply],
  )

  const onFocusSlot = useCallback(
    (index: number) => {
      apply((current) => focusSlot(current, index))
    },
    [apply],
  )

  const onClearSlot = useCallback(
    (index: number) => {
      apply((current) => clearSlot(current, index))
    },
    [apply],
  )

  const onModeChange = useCallback(
    (mode: LayoutMode) => {
      apply((current) => setMode(current, mode))
    },
    [apply],
  )

  const focusedSessionId = layout.slots[layout.focusedSlot] ?? null
  const onScreenIds = useMemo(() => new Set(liveSessionIds(layout)), [layout])
  const focusedSession =
    sessions.find((session) => session.id === focusedSessionId) ?? null

  const banner =
    socket.state === 'dead'
      ? 'Disconnected. Reload to reconnect.'
      : (saveError ?? notice)

  if (!authenticated) {
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
        projects={projects}
        sessions={sessions}
        selectedId={focusedSessionId}
        onScreenIds={onScreenIds}
        onSelect={onSelectSession}
        onNewSession={openSessionDialog}
        onNewProject={() => {
          setProjectDialogOpen(true)
        }}
        loading={loading}
        error={error}
        sourceKind={dataSource.kind}
      />
      <main className={styles.main} id="workspace-main">
        <div className={styles.topbar}>
          <p className={styles.crumbs}>
            workspace /{' '}
            <span className={styles.crumbCurrent}>{focusedSession?.name ?? 'no session'}</span>
          </p>
          <div className={styles.topbarRight}>
            <LayoutToolbar mode={layout.mode} onChange={onModeChange} />
            <ConnectionBadge state={socket.state} />
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className={styles.grid}>
            <div className={styles.empty}>
              {loading ? (
                <p>Loading sessions…</p>
              ) : (
                <>
                  <p>
                    {projects.length === 0
                      ? 'No projects yet. Add one, then start a session in it.'
                      : 'No sessions yet.'}
                  </p>
                  <button
                    type="button"
                    className={styles.emptyAction}
                    onClick={() => {
                      if (projects.length === 0) {
                        setProjectDialogOpen(true)
                      } else {
                        openSessionDialog(null)
                      }
                    }}
                  >
                    {projects.length === 0 ? 'Add a project' : 'New session'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <TerminalGrid
            layout={layout}
            sessions={sessions}
            panes={panes}
            live={live}
            deadSessions={deadSessions}
            notice={banner}
            onFocusSlot={onFocusSlot}
            onClearSlot={onClearSlot}
            onNewSession={() => {
              openSessionDialog(null)
            }}
          />
        )}
      </main>

      <NewSessionDialog
        open={sessionDialogOpen}
        projects={projects}
        initialProjectId={sessionDialogFor}
        onClose={() => {
          setSessionDialogOpen(false)
        }}
        onCreated={onSessionCreated}
      />
      <NewProjectDialog
        open={projectDialogOpen}
        projectRoot={projectRoot}
        onClose={() => {
          setProjectDialogOpen(false)
        }}
        onCreated={onProjectCreated}
      />
    </div>
  )
}

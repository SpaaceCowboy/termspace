'use client'

import type { Project, ServerFrame, Session } from '@termspace/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ConnectionBadge } from '@/components/ConnectionBadge'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { NewSessionDialog } from '@/components/NewSessionDialog'
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
  const [projects, setProjects] = useState<readonly Project[]>([])
  const [sessions, setSessions] = useState<readonly Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deadSessions, setDeadSessions] = useState<ReadonlySet<string>>(new Set())
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [sessionDialogFor, setSessionDialogFor] = useState<string | null>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)

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
        setSelectedId((current) => current ?? sessionResponse.data[0]?.id ?? null)
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
  }, [auth])

  const openSessionDialog = useCallback((forProjectId: string | null) => {
    setSessionDialogFor(forProjectId)
    setSessionDialogOpen(true)
  }, [])

  const onSessionCreated = useCallback((session: Session) => {
    setSessions((current) => [...current, session])
    setSelectedId(session.id)
    setSessionDialogOpen(false)
  }, [])

  const onProjectCreated = useCallback((project: Project) => {
    setProjects((current) => [...current, project])
    setProjectDialogOpen(false)
    // A project with no sessions is not much use, so go straight on to the
    // thing you actually came to do.
    setSessionDialogFor(project.id)
    setSessionDialogOpen(true)
  }, [])

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
        projects={projects}
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
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
            workspace / <span className={styles.crumbCurrent}>{selected?.name ?? 'no session'}</span>
          </p>
          <ConnectionBadge state={socket.state} />
        </div>
        <div className={styles.grid}>
          {selected === null ? (
            <div className={styles.empty}>
              {loading ? (
                <p>Loading sessions…</p>
              ) : (
                <>
                  <p>
                    {sessions.length === 0
                      ? projects.length === 0
                        ? 'No projects yet. Add one, then start a session in it.'
                        : 'No sessions yet.'
                      : 'No session selected.'}
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

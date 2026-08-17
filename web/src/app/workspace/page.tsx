'use client'

import type {
  AgentKind,
  LayoutMode,
  Project,
  ServerFrame,
  Session,
} from '@termspace/contracts'
import { normalizeLayout } from '@termspace/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConnectionBadge } from '@/components/ConnectionBadge'
import { DiffDialog } from '@/components/DiffDialog'
import { PushToggle } from '@/components/PushToggle'
import { LayoutToolbar } from '@/components/LayoutToolbar'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ProjectSettingsDialog } from '@/components/ProjectSettingsDialog'
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
  withoutSession,
} from '@/lib/layout/layout-actions.ts'
import { useLayout } from '@/lib/layout/useLayout.ts'
import { usePush } from '@/lib/push/usePush.ts'
import { documentTitle } from '@/lib/session-summary.ts'
import { withCwdConflicts } from '@/lib/session-conflicts.ts'
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
  const [projectRootWritable, setProjectRootWritable] = useState(true)
  const [defaultAgentCommands, setDefaultAgentCommands] = useState<Record<
    AgentKind,
    readonly string[]
  > | null>(null)
  const [pushPublicKey, setPushPublicKey] = useState<string | null>(null)
  /** The project whose launch commands are being edited, if any. */
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  /** Pending destructive confirmations, by id. */
  const [deletingProject, setDeletingProject] = useState<string | null>(null)
  const [deletingSession, setDeletingSession] = useState<string | null>(null)
  const [forceDeletingSession, setForceDeletingSession] = useState(false)
  const [sessionDialogFor, setSessionDialogFor] = useState<string | null>(null)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)

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

  // A pane that cannot build its terminal must say so. Swallowing this leaves a
  // pane that renders nothing and accepts no input, with nothing to go on.
  const onPaneError = useCallback((cause: unknown) => {
    setNotice(
      cause instanceof Error
        ? `The terminal failed to start: ${cause.message}`
        : 'The terminal failed to start.',
    )
  }, [])

  const socket = useSocket({ onFrame, onOutput }, live && authenticated)
  const panes = usePanes(socket, live && authenticated, onPaneError)
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
        setDefaultAgentCommands(
          configResponse.ok ? configResponse.data.defaultAgentCommands : null,
        )
        setPushPublicKey(configResponse.ok ? configResponse.data.pushPublicKey : null)
        setProjectRootWritable(
          configResponse.ok ? configResponse.data.projectRootWritable : true,
        )
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
      setSessions((current) => withCwdConflicts([...current, session]))
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

  /**
   * Deleting a session kills its tmux session, so the pane must come off screen
   * in the same beat — `withoutSession` clears every slot holding it, which is
   * what releases the terminal and unsubscribes the socket. Leaving the slot
   * would leave a pane attached to a session id the server no longer knows.
   */
  const onSessionDeleted = useCallback(
    (sid: string) => {
      setSessions((current) =>
        withCwdConflicts(current.filter((session) => session.id !== sid)),
      )
      setDeadSessions((current) => {
        if (!current.has(sid)) {
          return current
        }
        const next = new Set(current)
        next.delete(sid)
        return next
      })
      apply((current) => withoutSession(current, sid))
    },
    [apply],
  )

  const onProjectDeleted = useCallback((projectId: string) => {
    // The server refuses to delete a project that still has sessions, so by the
    // time this runs there are none to clean up.
    setProjects((current) => current.filter((project) => project.id !== projectId))
  }, [])

  /*
   * The tab title is the only signal that reaches someone who has switched
   * away, so it carries the worst state across every session, not the focused
   * one. Restored on unmount so a navigation away does not leave it shouting.
   */
  useEffect(() => {
    document.title = documentTitle(sessions)
    return () => {
      document.title = 'Termspace'
    }
  }, [sessions])

  const push = usePush(pushPublicKey, authenticated)

  /*
   * Tapping a notification focuses the pane it came from. The worker prefers an
   * existing tab over opening a second one — each tab holds its own socket and
   * terminals — so the request arrives as a message rather than as navigation.
   */
  useEffect(() => {
    if (!authenticated || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return
    }
    const onMessage = (event: MessageEvent<unknown>): void => {
      const data = event.data
      if (
        typeof data !== 'object' ||
        data === null ||
        (data as { type?: unknown }).type !== 'focus-session'
      ) {
        return
      }
      const sid = (data as { sessionId?: unknown }).sessionId
      if (typeof sid === 'string') {
        apply((current) => showSession(current, sid))
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
    }
  }, [apply, authenticated])

  /*
   * Opened straight from a notification, with no tab already running: the
   * worker cannot postMessage into a page that does not exist yet, so the
   * session arrives in the URL instead.
   */
  useEffect(() => {
    if (!authenticated || typeof window === 'undefined') {
      return
    }
    const requested = new URLSearchParams(window.location.search).get('session')
    if (requested === null) {
      return
    }
    apply((current) => showSession(current, requested))
    window.history.replaceState(null, '', '/workspace')
  }, [apply, authenticated])

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
  const reviewSessions = useMemo(() => {
    if (focusedSession === null) return []
    const others = liveSessionIds(layout)
      .filter((sessionId) => sessionId !== focusedSession.id)
      .map((sessionId) => sessions.find((session) => session.id === sessionId))
      .filter((session): session is Session => session !== undefined)
    return [focusedSession, ...others].slice(0, 2)
  }, [focusedSession, layout, sessions])

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
        onEditProject={(projectId) => {
          setSettingsFor(projectId)
        }}
        onDeleteProject={(projectId) => {
          setDeletingProject(projectId)
        }}
        onDeleteSession={(sessionId) => {
          setDeletingSession(sessionId)
          setForceDeletingSession(false)
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
            {focusedSession === null ? null : (
              <button
                type="button"
                className={styles.diffButton}
                onClick={() => { setDiffDialogOpen(true) }}
              >
                Review changes
              </button>
            )}
            <LayoutToolbar mode={layout.mode} onChange={onModeChange} />
            <PushToggle push={push} available={pushPublicKey !== null} />
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
      <DiffDialog
        open={diffDialogOpen && reviewSessions.length > 0}
        sessions={reviewSessions}
        onClose={() => { setDiffDialogOpen(false) }}
      />
      <ProjectSettingsDialog
        open={settingsFor !== null}
        project={projects.find((entry) => entry.id === settingsFor) ?? null}
        defaultAgentCommands={defaultAgentCommands}
        onClose={() => {
          setSettingsFor(null)
        }}
        onSaved={(updated) => {
          setProjects((current) =>
            current.map((entry) => (entry.id === updated.id ? updated : entry)),
          )
          setSettingsFor(null)
        }}
      />
      <ConfirmDialog
        open={deletingSession !== null}
        title="Delete session"
        confirmLabel={forceDeletingSession ? 'Force delete' : 'Delete session'}
        busyLabel="Deleting…"
        onClose={() => {
          setDeletingSession(null)
          setForceDeletingSession(false)
        }}
        onConfirm={async () => {
          if (deletingSession === null) {
            return null
          }
          const response = await dataSource.deleteSession(deletingSession, {
            ...(forceDeletingSession ? { force: true } : {}),
          })
          if (!response.ok) {
            if (response.error.code === 'worktree_dirty') {
              setForceDeletingSession(true)
              return 'This worktree has uncommitted files. Press “Force delete” to discard them. Its committed branch will be kept.'
            }
            return response.error.message
          }
          onSessionDeleted(deletingSession)
          return null
        }}
      >
        <p className={styles.confirmText}>
          <strong>
            {sessions.find((session) => session.id === deletingSession)?.name ??
              'This session'}
          </strong>{' '}
          will be stopped and removed. Whatever is running in it is killed and its
          scrollback goes with it. This cannot be undone.
        </p>
        {forceDeletingSession ? (
          <p className={styles.confirmText}>
            Force deletion discards the worktree’s uncommitted and untracked files. Commits and
            the branch remain in the repository.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={deletingProject !== null}
        title="Delete project"
        confirmLabel="Delete project"
        busyLabel="Deleting…"
        onClose={() => {
          setDeletingProject(null)
        }}
        onConfirm={async () => {
          if (deletingProject === null) {
            return null
          }
          const response = await dataSource.deleteProject(deletingProject)
          if (!response.ok) {
            return response.error.message
          }
          onProjectDeleted(deletingProject)
          return null
        }}
      >
        <p className={styles.confirmText}>
          <strong>
            {projects.find((project) => project.id === deletingProject)?.name ??
              'This project'}
          </strong>{' '}
          will be removed from Termspace. Its files are left exactly where they
          are on disk — nothing is deleted from{' '}
          <code className={styles.confirmPath}>
            {projects.find((project) => project.id === deletingProject)?.path ?? ''}
          </code>
          .
        </p>
        <p className={styles.confirmText}>
          A project with sessions cannot be deleted. Delete its sessions first.
        </p>
      </ConfirmDialog>

      <NewProjectDialog
        open={projectDialogOpen}
        projectRoot={projectRoot}
        projectRootWritable={projectRootWritable}
        onClose={() => {
          setProjectDialogOpen(false)
        }}
        onCreated={onProjectCreated}
      />
    </div>
  )
}

'use client'

import type {
  AgentAvailability,
  AgentKind,
  Favorites,
  LayoutMode,
  Project,
  ServerFrame,
  Session,
} from '@termspace/contracts'
import { normalizeLayout } from '@termspace/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ConnectionBadge } from '@/components/ConnectionBadge'
import { AppearanceDialog } from '@/components/AppearanceDialog'
import { DiffDialog } from '@/components/DiffDialog'
import { PushToggle } from '@/components/PushToggle'
import { LayoutToolbar } from '@/components/LayoutToolbar'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ProjectSettingsDialog } from '@/components/ProjectSettingsDialog'
import { NewSessionDialog } from '@/components/NewSessionDialog'
import { OperationsDialog } from '@/components/OperationsDialog'
import { NotificationCenter } from '@/components/NotificationCenter'
import { Sidebar } from '@/components/Sidebar'
import { TerminalGrid } from '@/components/TerminalGrid'
import { ToastRegion, useToasts } from '@/components/ToastRegion'
import { dataSource } from '@/lib/data'
import { cx } from '@/lib/cx'
import {
  clearSlot,
  focusSlot,
  liveSessionIds,
  setMode,
  showSession,
  withoutSession,
} from '@/lib/layout/layout-actions.ts'
import { useLayout } from '@/lib/layout/useLayout.ts'
import { useAppearance } from '@/lib/appearance.ts'
import { usePush } from '@/lib/push/usePush.ts'
import { documentTitle } from '@/lib/session-summary.ts'
import { sessionExitCopy } from '@/lib/session-runtime.ts'
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
  const [favorites, setFavorites] = useState<Favorites>({ projectIds: [], sessionIds: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [deadSessions, setDeadSessions] = useState<ReadonlySet<string>>(new Set())
  const [startingSessions, setStartingSessions] = useState<ReadonlySet<string>>(new Set())
  const [exitCodes, setExitCodes] = useState<ReadonlyMap<string, number | null>>(new Map())
  const [viewerFailures, setViewerFailures] = useState<ReadonlySet<string>>(new Set())
  const [projectRoot, setProjectRoot] = useState<string | null>(null)
  const [projectRootWritable, setProjectRootWritable] = useState(true)
  const [defaultAgentCommands, setDefaultAgentCommands] = useState<Record<
    AgentKind,
    readonly string[]
  > | null>(null)
  const [agentAvailability, setAgentAvailability] = useState<Record<
    AgentKind,
    AgentAvailability
  > | null>(null)
  const [initialSessionAgent, setInitialSessionAgent] = useState<AgentKind | undefined>()
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
  const [operationsOpen, setOperationsOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const {
    toasts,
    notifications,
    unreadCount,
    push: pushToast,
    dismiss: dismissToast,
    markAllRead,
    clearHistory,
  } = useToasts()
  const appearance = useAppearance()
  const terminalAppearance = useMemo(() => ({
    theme: appearance.preferences.terminalTheme,
    fontSize: appearance.preferences.terminalFontSize,
  }), [appearance.preferences.terminalFontSize, appearance.preferences.terminalTheme])

  const live = dataSource.kind === 'http'
  const authenticated = auth === 'authenticated'
  const { layout, saveError, apply } = useLayout(authenticated)

  // The socket handlers and the pane store need each other: frames feed the
  // store, and the store sends on the socket. The ref is what breaks the knot.
  const panesRef = useRef<PanesApi | null>(null)
  const favoritesGeneration = useRef(0)

  const onFrame = useCallback(
    (frame: ServerFrame) => {
      switch (frame.t) {
        case 'restore':
          panesRef.current?.restore(frame.sid, frame.data)
          setStartingSessions((current) => withoutSetValue(current, frame.sid))
          setViewerFailures((current) => withoutSetValue(current, frame.sid))
          return
        case 'truncated':
          pushToast('Output was truncated to keep up. The screen was resynced.', 'warning')
          return
        case 'exit':
          setDeadSessions((current) => new Set(current).add(frame.sid))
          setStartingSessions((current) => withoutSetValue(current, frame.sid))
          setExitCodes((current) => new Map(current).set(frame.sid, frame.code))
          setSessions((current) => current.map((session) =>
            session.id === frame.sid ? { ...session, state: 'dead' } : session,
          ))
          pushToast(
            sessionExitCopy(frame.code).toast,
            'warning',
          )
          return
        case 'status':
          setStartingSessions((current) => withoutSetValue(current, frame.sid))
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
          if (frame.code === 'viewer_attachment_failed' && frame.sid !== null) {
            setViewerFailures((current) => new Set(current).add(frame.sid as string))
          }
          pushToast(frame.message, 'error')
          return
        case 'pong':
          return
      }
    },
    [pushToast],
  )

  const onOutput = useCallback((sid: string, bytes: Uint8Array) => {
    setStartingSessions((current) => withoutSetValue(current, sid))
    panesRef.current?.write(sid, bytes)
  }, [])

  // A pane that cannot build its terminal must say so. Swallowing this leaves a
  // pane that renders nothing and accepts no input, with nothing to go on.
  const onPaneError = useCallback((cause: unknown) => {
    pushToast(
      cause instanceof Error
        ? `The terminal failed to start: ${cause.message}`
        : 'The terminal failed to start.',
      'error',
    )
  }, [pushToast])

  const onDestructiveInputArmed = useCallback((_sid: string, label: string) => {
    pushToast(`Press ${label} again within 3 seconds to send it.`, 'warning')
  }, [pushToast])

  const socket = useSocket({ onFrame, onOutput }, live && authenticated)
  const panes = usePanes(
    socket,
    live && authenticated,
    onPaneError,
    onDestructiveInputArmed,
    terminalAppearance,
  )
  panesRef.current = panes

  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)')
    const update = (): void => { setMobile(query.matches) }
    update()
    query.addEventListener('change', update)
    return () => { query.removeEventListener('change', update) }
  }, [])

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
      dataSource.favorites(controller.signal),
    ])
      .then(([projectResponse, sessionResponse, configResponse, favoritesResponse]) => {
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
        setAgentAvailability(configResponse.ok ? configResponse.data.agentAvailability : null)
        setPushPublicKey(configResponse.ok ? configResponse.data.pushPublicKey : null)
        setProjectRootWritable(
          configResponse.ok ? configResponse.data.projectRootWritable : true,
        )
        setFavorites(
          favoritesResponse.ok ? favoritesResponse.data : { projectIds: [], sessionIds: [] },
        )
        if (!configResponse.ok) {
          pushToast(`Some server settings could not be loaded: ${configResponse.error.message}`, 'warning')
        }
        if (!favoritesResponse.ok) {
          pushToast(`Favorites could not be loaded: ${favoritesResponse.error.message}`, 'warning')
        }
        setError(null)
        if (!projectResponse.ok) {
          pushToast(`Projects could not be loaded: ${projectResponse.error.message}`, 'warning')
        }
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
  }, [apply, authenticated, loadAttempt, pushToast])

  const openSessionDialog = useCallback((forProjectId: string | null) => {
    setSessionDialogFor(forProjectId)
    setInitialSessionAgent(undefined)
    setSessionDialogOpen(true)
  }, [])

  const onSessionCreated = useCallback(
    (session: Session) => {
      setSessions((current) => withCwdConflicts([...current, session]))
      setStartingSessions((current) => new Set(current).add(session.id))
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
      setStartingSessions((current) => withoutSetValue(current, sid))
      setExitCodes((current) => {
        const next = new Map(current)
        next.delete(sid)
        return next
      })
      setViewerFailures((current) => withoutSetValue(current, sid))
      apply((current) => withoutSession(current, sid))
      setFavorites((current) => ({
        ...current,
        sessionIds: current.sessionIds.filter((id) => id !== sid),
      }))
    },
    [apply],
  )

  const onProjectDeleted = useCallback((projectId: string) => {
    // The server refuses to delete a project that still has sessions, so by the
    // time this runs there are none to clean up.
    setProjects((current) => current.filter((project) => project.id !== projectId))
    setFavorites((current) => ({
      ...current,
      projectIds: current.projectIds.filter((id) => id !== projectId),
    }))
  }, [])

  const persistFavorites = useCallback((next: Favorites, previous: Favorites) => {
    const generation = ++favoritesGeneration.current
    setFavorites(next)
    void dataSource.saveFavorites(next).then((response) => {
      if (generation !== favoritesGeneration.current) return
      if (response.ok) {
        setFavorites(response.data)
        return
      }
      setFavorites(previous)
      pushToast(`Could not save favorites: ${response.error.message}`, 'error')
    })
  }, [pushToast])

  const toggleProjectFavorite = useCallback((projectId: string) => {
    const pinned = favorites.projectIds.includes(projectId)
    persistFavorites({
      ...favorites,
      projectIds: pinned
        ? favorites.projectIds.filter((id) => id !== projectId)
        : [projectId, ...favorites.projectIds],
    }, favorites)
  }, [favorites, persistFavorites])

  const toggleSessionFavorite = useCallback((sessionId: string) => {
    const pinned = favorites.sessionIds.includes(sessionId)
    persistFavorites({
      ...favorites,
      sessionIds: pinned
        ? favorites.sessionIds.filter((id) => id !== sessionId)
        : [sessionId, ...favorites.sessionIds],
    }, favorites)
  }, [favorites, persistFavorites])

  useEffect(() => {
    if (saveError !== null) pushToast(`Layout could not be saved: ${saveError}`, 'error')
  }, [pushToast, saveError])

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
      setMobileNavOpen(false)
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
  const deletingSessionRecord =
    sessions.find((session) => session.id === deletingSession) ?? null
  const reviewSessions = useMemo(() => {
    if (focusedSession === null) return []
    const others = liveSessionIds(layout)
      .filter((sessionId) => sessionId !== focusedSession.id)
      .map((sessionId) => sessions.find((session) => session.id === sessionId))
      .filter((session): session is Session => session !== undefined)
    return [focusedSession, ...others].slice(0, 2)
  }, [focusedSession, layout, sessions])

  if (!authenticated) {
    return (
      <main className={styles.gate}>
        <span className={styles.gateMark} aria-hidden="true">▌</span>
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
        startingSessionIds={startingSessions}
        favorites={favorites}
        selectedId={focusedSessionId}
        onScreenIds={onScreenIds}
        onSelect={onSelectSession}
        onNewSession={(projectId) => {
          setMobileNavOpen(false)
          openSessionDialog(projectId)
        }}
        onNewProject={() => {
          setMobileNavOpen(false)
          setProjectDialogOpen(true)
        }}
        onEditProject={(projectId) => {
          setMobileNavOpen(false)
          setSettingsFor(projectId)
        }}
        onDeleteProject={(projectId) => {
          setMobileNavOpen(false)
          setDeletingProject(projectId)
        }}
        onDeleteSession={(sessionId) => {
          setMobileNavOpen(false)
          setDeletingSession(sessionId)
          setForceDeletingSession(false)
        }}
        onToggleProjectFavorite={toggleProjectFavorite}
        onToggleSessionFavorite={toggleSessionFavorite}
        onRetry={() => { setLoadAttempt((current) => current + 1) }}
        loading={loading}
        error={error}
        sourceKind={dataSource.kind}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => { setMobileNavOpen(false) }}
      />
      {mobileNavOpen ? (
        <button
          type="button"
          className={styles.mobileBackdrop}
          aria-label="Close sessions menu"
          onClick={() => { setMobileNavOpen(false) }}
        />
      ) : null}
      <main className={styles.main} id="workspace-main">
        <div className={styles.topbar}>
          <button
            type="button"
            className={styles.mobileMenu}
            aria-controls="workspace-sidebar"
            aria-expanded={mobileNavOpen}
            onClick={() => { setMobileNavOpen(true) }}
          >
            Sessions
          </button>
          <p className={styles.crumbs}>
            workspace /{' '}
            <span className={styles.crumbCurrent}>{focusedSession?.name ?? 'no session'}</span>
          </p>
          <div className={styles.topbarRight}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => { setNotificationsOpen(true) }}
              aria-label={`Notifications${unreadCount === 0 ? '' : `, ${String(unreadCount)} unread`}`}
              title="Notifications"
            >
              <span aria-hidden="true">◉</span>
              {unreadCount === 0 ? null : <span className={styles.notificationCount}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => { setAppearanceOpen(true) }}
              aria-label="Appearance settings"
              title="Appearance"
            >
              <span aria-hidden="true" className={styles.appearanceGlyph}>Aa</span>
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => { setOperationsOpen(true) }}
            >
              <span className={styles.wideLabel}>Operations</span><span className={styles.shortLabel}>Ops</span>
            </button>
            {focusedSession === null ? null : (
              <button
                type="button"
                className={styles.diffButton}
                onClick={() => { setDiffDialogOpen(true) }}
              >
                <span className={styles.wideLabel}>Review changes</span><span className={styles.shortLabel}>Changes</span>
              </button>
            )}
            <span className={styles.layoutControls}>
              <LayoutToolbar mode={layout.mode} onChange={onModeChange} />
            </span>
            <span className={styles.pushControls}><PushToggle push={push} available={pushPublicKey !== null} /></span>
            <ConnectionBadge state={socket.state} />
          </div>
        </div>

        {socket.state === 'reconnecting' && live ? (
          <div className={styles.reconnecting} role="status">
            <span><strong>Reconnecting terminal view…</strong> Sessions keep running and typed input is held until the screen is restored.</span>
          </div>
        ) : null}

        {socket.state === 'dead' && live ? (
          <div className={styles.disconnected} role="alert">
            <span><strong>Terminal connection lost.</strong> Running sessions are safe in tmux.</span>
            <button type="button" onClick={socket.reconnect}>Reconnect</button>
          </div>
        ) : null}

        {sessions.length === 0 ? (
          <div className={styles.grid}>
            {loading ? (
              <div className={styles.workspaceSkeleton} role="status" aria-label="Loading workspace">
                <span /><span /><span />
              </div>
            ) : error !== null ? (
              <div className={cx(styles.empty, styles.emptyError)} role="alert">
                <span className={styles.stateIcon} aria-hidden="true">!</span>
                <h2>Workspace unavailable</h2>
                <p>{error}</p>
                <button type="button" className={styles.emptyAction} onClick={() => { setLoadAttempt((current) => current + 1) }}>Try again</button>
              </div>
            ) : (
              <div className={styles.empty}>
                <span className={styles.stateIcon} aria-hidden="true">{projects.length === 0 ? '+' : '›_'}</span>
                <h2>{projects.length === 0 ? 'Create your first project' : 'Start a session'}</h2>
                <p>{projects.length === 0 ? 'Projects connect Termspace to a working directory or Git repository.' : 'This project is ready. Start an agent or shell to begin.'}</p>
                <button
                  type="button"
                  className={styles.emptyAction}
                  onClick={() => {
                    if (projects.length === 0) setProjectDialogOpen(true)
                    else openSessionDialog(null)
                  }}
                >
                  {projects.length === 0 ? 'Add project' : 'New session'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <TerminalGrid
            layout={layout}
            sessions={sessions}
            panes={panes}
            live={live}
            deadSessions={deadSessions}
            startingSessions={startingSessions}
            exitCodes={exitCodes}
            connectionState={socket.state}
            viewerFailures={viewerFailures}
            onFocusSlot={onFocusSlot}
            onClearSlot={onClearSlot}
            onNewSession={() => {
              openSessionDialog(null)
            }}
            onOpenAsShell={(session) => {
              setSessionDialogFor(session.projectId)
              setInitialSessionAgent('shell')
              setSessionDialogOpen(true)
            }}
            onDeleteSession={(sessionId) => {
              setDeletingSession(sessionId)
              setForceDeletingSession(false)
            }}
            onReconnectView={(sessionId) => { socket.reattach(sessionId) }}
            mobile={mobile}
          />
        )}
      </main>

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
      <OperationsDialog open={operationsOpen} onClose={() => { setOperationsOpen(false) }} />
      <AppearanceDialog
        open={appearanceOpen}
        preferences={appearance.preferences}
        onClose={() => { setAppearanceOpen(false) }}
        onSave={(preferences) => {
          appearance.save(preferences)
          pushToast('Appearance updated.', 'info')
        }}
      />
      <NotificationCenter
        open={notificationsOpen}
        notifications={notifications}
        onMarkAllRead={markAllRead}
        onClear={clearHistory}
        onClose={() => { setNotificationsOpen(false) }}
      />

      <NewSessionDialog
        open={sessionDialogOpen}
        projects={projects}
        initialProjectId={sessionDialogFor}
        {...(initialSessionAgent === undefined ? {} : { initialAgent: initialSessionAgent })}
        defaultAgentCommands={defaultAgentCommands}
        agentAvailability={agentAvailability}
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
        doublePress
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
          will be stopped and removed.
        </p>
        <ul className={styles.confirmList}>
          <li>The agent process and its tmux session will be stopped.</li>
          <li>The live terminal scrollback and Termspace session record will be removed.</li>
          {deletingSessionRecord === null || deletingSessionRecord.worktreeBranch === null ? (
            <li>Project files remain on disk, including any changes made in the shared directory.</li>
          ) : (
            <>
              <li>The worktree directory <code className={styles.confirmPath}>{deletingSessionRecord.cwd}</code> will be removed.</li>
              <li>Commits and branch <code className={styles.confirmPath}>{deletingSessionRecord.worktreeBranch}</code> remain in Git.</li>
              <li>Uncommitted changes block deletion unless you explicitly force it.</li>
            </>
          )}
        </ul>
        <p className={styles.confirmText}>This cannot be undone. Closing a pane instead keeps the session running.</p>
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
        doublePress
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

function withoutSetValue(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
  if (!values.has(value)) return values
  const next = new Set(values)
  next.delete(value)
  return next
}

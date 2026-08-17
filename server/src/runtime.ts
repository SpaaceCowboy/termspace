import { hostname } from 'node:os'

import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import type Database from 'better-sqlite3'

import { buildApp } from './app.js'
import { WorktreeManager } from './git/worktree-manager.js'
import { GitDiffReader } from './git/diff-reader.js'
import { AuthService } from './auth/auth-service.js'
import { LoginRateLimiter } from './auth/login-rate-limiter.js'
import { AuthSessionStore } from './auth/session-store.js'
import { UserRepository } from './auth/user-repository.js'
import type { Environment } from './config/env.js'
import { registerPhase1Routes } from './http/routes.js'
import { LayoutRepository } from './layouts/layout-repository.js'
import { OperationalStatusService } from './operations/operational-status.js'
import { FavoritesRepository } from './preferences/favorites-repository.js'
import { ProjectManager } from './projects/project-manager.js'
import { ProjectRepository } from './projects/project-repository.js'
import { NodePtySpawner } from './pty/node-pty-spawner.js'
import { ViewerAttachmentFactory } from './pty/viewer-attachment.js'
import { SessionManager } from './sessions/session-manager.js'
import { SessionLivenessReconciler } from './sessions/session-liveness-reconciler.js'
import { SessionIdleReaper } from './sessions/session-idle-reaper.js'
import { safeErrorLog } from './logging/request-logging.js'
import { SessionRepository } from './sessions/session-repository.js'
import { HeadlessBufferRegistry } from './terminal/headless-buffer.js'
import { createOutputCoalescer } from './terminal/output-coalescer.js'
import { ExecFileProcessRunner } from './tmux/process-runner.js'
import { TmuxClient } from './tmux/tmux-client.js'
import { GatewayConnection } from './ws/gateway-connection.js'
import { SessionActivityTracker } from './activity/activity-tracker.js'
import { SessionTitler } from './activity/session-titler.js'
import { PushNotifier } from './push/push-notifier.js'
import { PushSubscriptionRepository } from './push/push-repository.js'
import { createWebPushSender, readVapidConfig } from './push/web-push-sender.js'
import { SessionFeedCoordinator } from './ws/session-feed-coordinator.js'
import { TicketStore } from './ws/ticket-store.js'
import { WebSocketGatewayServer } from './ws/websocket-server.js'

export interface ServerRuntimeServices {
  readonly auth: AuthService
  readonly authSessions: AuthSessionStore
  readonly layouts: LayoutRepository
  readonly loginRateLimiter: LoginRateLimiter
  readonly projects: ProjectManager
  readonly sessions: SessionManager
  readonly tickets: TicketStore
  readonly users: UserRepository
}

export interface ServerRuntime {
  readonly app: FastifyInstance
  readonly services: ServerRuntimeServices
}

export function createServerRuntime(
  database: Database.Database,
  environment: Environment,
  appOptions: FastifyServerOptions = {},
): ServerRuntime {
  const app = buildApp(appOptions)
  const users = new UserRepository(database)
  const auth = new AuthService(users)
  const authSessions = new AuthSessionStore({
    ttlMs: environment.TERMSPACE_AUTH_SESSION_TTL_MS,
  })
  const loginRateLimiter = new LoginRateLimiter({
    maxAttempts: 5,
    windowMs: 60_000,
  })
  const tickets = new TicketStore({ ttlMs: 10_000 })
  const sessionRepository = new SessionRepository(database)
  const pushRepository = new PushSubscriptionRepository(database)
  const vapid = readVapidConfig(environment)
  const processes = new ExecFileProcessRunner()
  const tmux = new TmuxClient(processes, {
    ...(environment.TERMSPACE_TMUX_SOCKET_PATH === undefined
      ? { socketName: environment.TERMSPACE_TMUX_SOCKET_NAME }
      : { socketPath: environment.TERMSPACE_TMUX_SOCKET_PATH }),
    ...(environment.TERMSPACE_SYSTEMD_SESSION_SCOPES
      ? {
          sessionScope: {
            memoryMaxBytes: environment.TERMSPACE_SESSION_MEMORY_MAX_BYTES,
            shell: environment.TERMSPACE_SESSION_SHELL,
          },
        }
      : {}),
  })
  const sessions = new SessionManager(sessionRepository, tmux, {
    diffs: new GitDiffReader(processes),
    worktrees: new WorktreeManager(processes, environment.TERMSPACE_PROJECT_ROOT),
  })
  const layouts = new LayoutRepository(database)
  const favorites = new FavoritesRepository(database)
  const projects = new ProjectManager(
    new ProjectRepository(database),
    processes,
    environment.TERMSPACE_PROJECT_ROOT,
  )
  const operations = new OperationalStatusService({
    environment,
    journal: processes,
    sessions,
    tmux,
  })
  registerPhase1Routes(app, {
    auth,
    authSessionTtlMs: environment.TERMSPACE_AUTH_SESSION_TTL_MS,
    authSessions,
    favorites,
    layouts,
    loginRateLimiter,
    operations,
    projects,
    push: {
      publicKey: vapid?.publicKey ?? null,
      subscribe: (userId, subscription) => {
        pushRepository.save(userId, subscription, Date.now())
      },
      unsubscribe: (userId, endpoint) => pushRepository.delete(userId, endpoint),
      count: (userId) => pushRepository.countForUser(userId),
    },
    sessions,
    tickets,
    users,
  })
  const buffers = new HeadlessBufferRegistry()
  const attachments = new ViewerAttachmentFactory(new NodePtySpawner())
  const feeds = new SessionFeedCoordinator()
  const onGatewayError = (error: unknown): void => {
    app.log.error(safeErrorLog(error), 'WebSocket gateway failure')
  }

  /*
   * One tracker for the process, not one per connection: session state must
   * keep advancing while nobody is watching, and two tabs on the same session
   * have to agree about it.
   */
  const activity = new SessionActivityTracker({ onError: onGatewayError })
  /*
   * Titles come from tmux's `pane_title` — what the program in the pane told
   * its terminal it is doing — rather than from guessing at the output. One
   * titler for the process, for the same reason as the tracker.
   */
  const titles = new SessionTitler({
    readTitle: (sessionId) => tmux.paneTitle(sessionId),
    hostname: hostname(),
    onError: onGatewayError,
  })
  titles.listen((change) => {
    try {
      sessionRepository.updateTitle(change.sessionId, change.title)
    } catch (error) {
      // A write failure must not stop the frame reaching the browser.
      onGatewayError(error)
    }
  })
  activity.listen((change) => {
    titles.observe(change)
  })
  const liveness = new SessionLivenessReconciler({
    activity,
    sessions,
    tmux,
    onError: onGatewayError,
  })
  const idleReaper = new SessionIdleReaper({
    sessions,
    graceMs: environment.TERMSPACE_IDLE_SESSION_GRACE_MS,
    onError: onGatewayError,
  })
  const pushNotifier =
    vapid === null
      ? null
      : new PushNotifier({
          repository: pushRepository,
          sender: createWebPushSender(vapid),
          onError: onGatewayError,
          log: (event) => {
            // Outcome and latency, never the payload.
            app.log.info({ event: 'push_delivery', ...event }, 'Push delivery')
          },
        })

  activity.listen((change) => {
    try {
      sessionRepository.updateState(change.sessionId, change.state, change.since)
    } catch (error) {
      // A write failure must not stop the frame reaching the browser.
      onGatewayError(error)
    }
    if (change.state !== 'needs-you' || pushNotifier === null) {
      return
    }
    const session = sessions.find(change.sessionId)
    if (session === null) {
      return
    }
    // Fire and forget: a slow push service must never hold up a status frame.
    void pushNotifier.notifyAll(session).catch(onGatewayError)
  })
  // Start only after the persistence listener exists. The first reconciliation
  // runs immediately, and an already-dead row must not lose that transition.
  liveness.start()
  idleReaper.start()
  const gateway = new WebSocketGatewayServer(app.server, {
    allowedOrigin: environment.TERMSPACE_ALLOWED_ORIGIN,
    tickets,
    onError: onGatewayError,
    onRejected: (rejection) => {
      if (rejection.reason === 'origin_rejected') {
        app.log.error(
          rejection,
          'WebSocket upgrade rejected: the browser\'s Origin is not the configured one. ' +
            'Set TERMSPACE_ALLOWED_ORIGIN to the origin you load the app from.',
        )
        return
      }
      app.log.warn(rejection, 'WebSocket upgrade rejected')
    },
    createConnection: (transport) =>
      new GatewayConnection({
        sessions,
        attachments,
        buffers,
        capture: (sessionId) => tmux.capture(sessionId),
        feeds,
        activity,
        titles,
        createCoalescer: createOutputCoalescer,
        transport,
        onError: onGatewayError,
      }),
  })

  gateway.start()
  app.addHook('onClose', async () => {
    gateway.close()
    liveness.dispose()
    idleReaper.dispose()
    activity.dispose()
    titles.dispose()
    buffers.dispose()
    if (database.open) {
      database.close()
    }
  })

  return {
    app,
    services: {
      auth,
      authSessions,
      layouts,
      loginRateLimiter,
      projects,
      sessions,
      tickets,
      users,
    },
  }
}

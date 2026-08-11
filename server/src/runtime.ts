import type { FastifyInstance, FastifyServerOptions } from 'fastify'
import type Database from 'better-sqlite3'

import { buildApp } from './app.js'
import { AuthService } from './auth/auth-service.js'
import { LoginRateLimiter } from './auth/login-rate-limiter.js'
import { AuthSessionStore } from './auth/session-store.js'
import { UserRepository } from './auth/user-repository.js'
import type { Environment } from './config/env.js'
import { registerPhase1Routes } from './http/routes.js'
import { ProjectManager } from './projects/project-manager.js'
import { ProjectRepository } from './projects/project-repository.js'
import { NodePtySpawner } from './pty/node-pty-spawner.js'
import { ViewerAttachmentFactory } from './pty/viewer-attachment.js'
import { SessionManager } from './sessions/session-manager.js'
import { SessionRepository } from './sessions/session-repository.js'
import { HeadlessBufferRegistry } from './terminal/headless-buffer.js'
import { createFocusedOutputCoalescer } from './terminal/output-coalescer.js'
import { ExecFileProcessRunner } from './tmux/process-runner.js'
import { TmuxClient } from './tmux/tmux-client.js'
import { GatewayConnection } from './ws/gateway-connection.js'
import { SessionFeedCoordinator } from './ws/session-feed-coordinator.js'
import { TicketStore } from './ws/ticket-store.js'
import { WebSocketGatewayServer } from './ws/websocket-server.js'

export interface ServerRuntimeServices {
  readonly auth: AuthService
  readonly authSessions: AuthSessionStore
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
  const processes = new ExecFileProcessRunner()
  const tmux = new TmuxClient(processes)
  const sessions = new SessionManager(sessionRepository, tmux)
  const projects = new ProjectManager(
    new ProjectRepository(database),
    processes,
    environment.TERMSPACE_PROJECT_ROOT,
  )
  registerPhase1Routes(app, {
    auth,
    authSessionTtlMs: environment.TERMSPACE_AUTH_SESSION_TTL_MS,
    authSessions,
    loginRateLimiter,
    projects,
    sessions,
    tickets,
    users,
  })
  const buffers = new HeadlessBufferRegistry()
  const attachments = new ViewerAttachmentFactory(new NodePtySpawner())
  const feeds = new SessionFeedCoordinator()
  const onGatewayError = (error: unknown): void => {
    app.log.error({ err: error }, 'WebSocket gateway failure')
  }
  const gateway = new WebSocketGatewayServer(app.server, {
    allowedOrigin: environment.TERMSPACE_ALLOWED_ORIGIN,
    tickets,
    onError: onGatewayError,
    createConnection: (transport) =>
      new GatewayConnection({
        sessions,
        attachments,
        buffers,
        capture: (sessionId) => tmux.capture(sessionId),
        feeds,
        createCoalescer: createFocusedOutputCoalescer,
        transport,
        onError: onGatewayError,
      }),
  })

  gateway.start()
  app.addHook('onClose', async () => {
    gateway.close()
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
      loginRateLimiter,
      projects,
      sessions,
      tickets,
      users,
    },
  }
}

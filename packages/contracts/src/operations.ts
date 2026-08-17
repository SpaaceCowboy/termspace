export const OPERATIONAL_HEALTH_STATES = ['healthy', 'degraded', 'unavailable'] as const
export type OperationalHealth = (typeof OPERATIONAL_HEALTH_STATES)[number]

export const OPERATIONAL_EVENT_KINDS = [
  'http_request_complete',
  'database_backup_complete',
  'push_delivery',
] as const
export type OperationalEventKind = (typeof OPERATIONAL_EVENT_KINDS)[number]

export const OPERATIONAL_EVENT_LEVELS = ['info', 'warn', 'error'] as const
export type OperationalEventLevel = (typeof OPERATIONAL_EVENT_LEVELS)[number]

/** User-scoped ordering preferences. Unknown and deleted ids are omitted on reads. */
export interface Favorites {
  projectIds: readonly string[]
  sessionIds: readonly string[]
}

/**
 * A deliberately small, sanitized operational event. The server constructs the
 * summary from allowlisted fields; raw journal messages never cross the API.
 */
export interface OperationalEvent {
  at: number
  kind: OperationalEventKind
  level: OperationalEventLevel
  summary: string
}

export interface OperationalStatus {
  generatedAt: number
  gateway: {
    health: OperationalHealth
    version: string
    uptimeMs: number
  }
  tmux: {
    health: OperationalHealth
    liveSessions: number | null
    persistedSessions: number
  }
  storage: {
    databaseBytes: number | null
    projectRoot: {
      path: string
      totalBytes: number | null
      availableBytes: number | null
    }
    backups: {
      count: number | null
      latestAt: number | null
      latestBytes: number | null
    }
  }
  policy: {
    sessionMemoryMaxBytes: number
    idleSessionGraceMs: number
    backupRetentionCount: number
  }
  eventsAvailable: boolean
  recentEvents: readonly OperationalEvent[]
}

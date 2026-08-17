import { readdir, stat, statfs } from 'node:fs/promises'
import { resolve } from 'node:path'

import type {
  OperationalEvent,
  OperationalEventLevel,
  OperationalStatus,
  Session,
} from '@termspace/contracts'
import { z } from 'zod'

import type { Environment } from '../config/env.js'
import type { BoundedCommandResult } from '../tmux/process-runner.js'
import { VERSION } from '../version.js'

const CACHE_MS = 5_000
const JOURNAL_MAX_BYTES = 256 * 1_024
const JOURNAL_MAX_EVENTS = 20
const BACKUP_NAME = /^termspace-\d{8}T\d{6}\.\d{3}Z\.sqlite3$/

const JournalRowSchema = z.object({
  MESSAGE: z.string().max(64 * 1_024),
  __REALTIME_TIMESTAMP: z.string().regex(/^\d+$/),
}).passthrough()

const HttpEventSchema = z.object({
  event: z.literal('http_request_complete'),
  request: z.object({
    method: z.string().min(1).max(16).regex(/^[A-Z]+$/),
    path: z.string().min(1).max(2_048),
  }).passthrough(),
  response: z.object({ statusCode: z.number().int().min(100).max(599) }).passthrough(),
}).passthrough()

const BackupEventSchema = z.object({
  event: z.literal('database_backup_complete'),
  pages: z.number().int().nonnegative().optional(),
}).passthrough()

const PushEventSchema = z.object({
  event: z.literal('push_delivery'),
  attempted: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  expired: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
}).passthrough()

interface TmuxStatusReader {
  listSessionIds(): Promise<ReadonlySet<string>>
}

interface SessionStatusReader {
  list(): readonly Session[]
}

interface JournalRunner {
  runBounded(
    command: string,
    arguments_: readonly string[],
    maxStdoutBytes: number,
  ): Promise<BoundedCommandResult>
}

export interface OperationalStatusOptions {
  readonly environment: Environment
  readonly journal: JournalRunner
  readonly sessions: SessionStatusReader
  readonly tmux: TmuxStatusReader
  readonly now?: () => number
  readonly uptimeMs?: () => number
}

export class OperationalStatusService {
  readonly #environment: Environment
  readonly #journal: JournalRunner
  readonly #sessions: SessionStatusReader
  readonly #tmux: TmuxStatusReader
  readonly #now: () => number
  readonly #uptimeMs: () => number
  #cached: OperationalStatus | null = null
  #pending: Promise<OperationalStatus> | null = null

  constructor(options: OperationalStatusOptions) {
    this.#environment = options.environment
    this.#journal = options.journal
    this.#sessions = options.sessions
    this.#tmux = options.tmux
    this.#now = options.now ?? Date.now
    this.#uptimeMs = options.uptimeMs ?? (() => Math.round(process.uptime() * 1_000))
  }

  async snapshot(): Promise<OperationalStatus> {
    const now = this.#now()
    if (this.#cached !== null && now - this.#cached.generatedAt < CACHE_MS) {
      return this.#cached
    }
    if (this.#pending !== null) {
      return this.#pending
    }
    this.#pending = this.#collect(now)
    try {
      this.#cached = await this.#pending
      return this.#cached
    } finally {
      this.#pending = null
    }
  }

  async #collect(generatedAt: number): Promise<OperationalStatus> {
    const persistedSessions = this.#sessions.list().length
    const [tmux, storage, events] = await Promise.all([
      this.#collectTmux(persistedSessions),
      this.#collectStorage(),
      this.#collectEvents(),
    ])
    return {
      generatedAt,
      gateway: { health: 'healthy', version: VERSION, uptimeMs: this.#uptimeMs() },
      tmux,
      storage,
      policy: {
        sessionMemoryMaxBytes: this.#environment.TERMSPACE_SESSION_MEMORY_MAX_BYTES,
        idleSessionGraceMs: this.#environment.TERMSPACE_IDLE_SESSION_GRACE_MS,
        backupRetentionCount: this.#environment.TERMSPACE_BACKUP_RETENTION_COUNT,
      },
      eventsAvailable: events.available,
      recentEvents: events.items,
    }
  }

  async #collectTmux(persistedSessions: number): Promise<OperationalStatus['tmux']> {
    try {
      const liveSessions = (await this.#tmux.listSessionIds()).size
      return { health: 'healthy', liveSessions, persistedSessions }
    } catch {
      return { health: 'unavailable', liveSessions: null, persistedSessions }
    }
  }

  async #collectStorage(): Promise<OperationalStatus['storage']> {
    const databasePath = resolve(this.#environment.TERMSPACE_DATABASE_PATH)
    const projectRoot = this.#environment.TERMSPACE_PROJECT_ROOT
    const backupDirectory = resolve(this.#environment.TERMSPACE_BACKUP_DIRECTORY)
    const [databaseBytes, filesystem, backups] = await Promise.all([
      stat(databasePath).then((item) => item.size).catch(() => null),
      statfs(projectRoot)
        .then((item) => ({
          totalBytes: item.blocks * item.bsize,
          availableBytes: item.bavail * item.bsize,
        }))
        .catch(() => ({ totalBytes: null, availableBytes: null })),
      collectBackups(backupDirectory),
    ])
    return {
      databaseBytes,
      projectRoot: { path: projectRoot, ...filesystem },
      backups,
    }
  }

  async #collectEvents(): Promise<{
    readonly available: boolean
    readonly items: readonly OperationalEvent[]
  }> {
    try {
      const result = await this.#journal.runBounded(
        'journalctl',
        [
          '--namespace=termspace',
          '--output=json',
          '--no-pager',
          '--lines=80',
          '--unit=termspace-gateway.service',
          '--unit=termspace-backup.service',
        ],
        JOURNAL_MAX_BYTES,
      )
      return { available: true, items: parseJournalEvents(result.stdout) }
    } catch {
      return { available: false, items: [] }
    }
  }
}

async function collectBackups(
  directory: string,
): Promise<OperationalStatus['storage']['backups']> {
  try {
    const names = (await readdir(directory)).filter((name) => BACKUP_NAME.test(name)).sort()
    const latest = names.at(-1)
    if (latest === undefined) {
      return { count: 0, latestAt: null, latestBytes: null }
    }
    const metadata = await stat(resolve(directory, latest))
    return { count: names.length, latestAt: metadata.mtimeMs, latestBytes: metadata.size }
  } catch {
    return { count: null, latestAt: null, latestBytes: null }
  }
}

export function parseJournalEvents(stdout: string): readonly OperationalEvent[] {
  const events: OperationalEvent[] = []
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    try {
      const row = JournalRowSchema.parse(JSON.parse(line) as unknown)
      const at = Math.floor(Number(row.__REALTIME_TIMESTAMP) / 1_000)
      if (!Number.isSafeInteger(at)) continue
      const message = JSON.parse(row.MESSAGE) as unknown
      const event = sanitizeEvent(at, message)
      if (event !== null) events.push(event)
    } catch {
      // A journal is heterogeneous. Unknown/malformed records are intentionally skipped.
    }
  }
  return events.sort((a, b) => b.at - a.at).slice(0, JOURNAL_MAX_EVENTS)
}

function sanitizeEvent(at: number, value: unknown): OperationalEvent | null {
  const http = HttpEventSchema.safeParse(value)
  if (http.success) {
    const status = http.data.response.statusCode
    const level: OperationalEventLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
    const path = http.data.request.path.split('?')[0] ?? '/'
    return {
      at,
      kind: 'http_request_complete',
      level,
      summary: `${http.data.request.method} ${path} completed with ${String(status)}`,
    }
  }
  const backup = BackupEventSchema.safeParse(value)
  if (backup.success) {
    return {
      at,
      kind: 'database_backup_complete',
      level: 'info',
      summary: backup.data.pages === undefined
        ? 'Database backup completed'
        : `Database backup completed (${String(backup.data.pages)} pages)`,
    }
  }
  const push = PushEventSchema.safeParse(value)
  if (push.success) {
    return {
      at,
      kind: 'push_delivery',
      level: push.data.failed > 0 ? 'warn' : 'info',
      summary: `Push delivery: ${String(push.data.sent)}/${String(push.data.attempted)} sent`,
    }
  }
  return null
}

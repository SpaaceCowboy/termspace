import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { sessionFixtures } from '@termspace/contracts'

import { readEnvironment } from '../config/env.js'
import { OperationalStatusService, parseJournalEvents } from './operational-status.js'

const JOURNAL_AT = '1767225600000000'

function journalLine(message: unknown, at = JOURNAL_AT): string {
  return JSON.stringify({ MESSAGE: JSON.stringify(message), __REALTIME_TIMESTAMP: at })
}

describe('operational status', () => {
  it('sanitizes allowlisted events and discards raw and malformed journal data', () => {
    const events = parseJournalEvents([
      journalLine({
        event: 'http_request_complete',
        request: { method: 'GET', path: '/api/sessions?ticket=secret', remoteAddress: 'private' },
        response: { statusCode: 503 },
        password: 'never-return-this',
      }),
      journalLine({ event: 'database_backup_complete', path: '/secret/db', pages: 42 }),
      journalLine({ event: 'push_delivery', attempted: 2, sent: 1, expired: 0, failed: 1 }),
      journalLine({ event: 'not_allowlisted', terminalBytes: 'secret output' }),
      '{bad json',
    ].join('\n'))

    assert.deepEqual(events.map(({ kind, level, summary }) => ({ kind, level, summary })), [
      { kind: 'http_request_complete', level: 'error', summary: 'GET /api/sessions completed with 503' },
      { kind: 'database_backup_complete', level: 'info', summary: 'Database backup completed (42 pages)' },
      { kind: 'push_delivery', level: 'warn', summary: 'Push delivery: 1/2 sent' },
    ])
    assert.doesNotMatch(JSON.stringify(events), /secret|terminal|private/)
  })

  it('collects real file metrics, session counts, policies, and caches briefly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'termspace-operations-'))
    const projectRoot = join(root, 'projects')
    const backups = join(root, 'backups')
    const database = join(root, 'termspace.db')
    await mkdir(projectRoot)
    await mkdir(backups)
    await writeFile(database, 'database')
    await writeFile(join(backups, 'termspace-20260817T120000.000Z.sqlite3'), 'backup')
    let journalCalls = 0
    let now = 1_767_225_600_000
    const service = new OperationalStatusService({
      environment: readEnvironment({
        TERMSPACE_DATABASE_PATH: database,
        TERMSPACE_PROJECT_ROOT: projectRoot,
        TERMSPACE_BACKUP_DIRECTORY: backups,
      }),
      sessions: { list: () => sessionFixtures },
      tmux: { listSessionIds: async () => new Set(sessionFixtures.slice(0, 2).map(({ id }) => id)) },
      journal: {
        runBounded: async () => {
          journalCalls += 1
          return { stdout: '', stderr: '', truncated: false }
        },
      },
      now: () => now,
      uptimeMs: () => 12_345,
    })

    const first = await service.snapshot()
    assert.equal(first.gateway.uptimeMs, 12_345)
    assert.equal(first.tmux.liveSessions, 2)
    assert.equal(first.tmux.persistedSessions, sessionFixtures.length)
    assert.equal(first.storage.databaseBytes, 8)
    assert.equal(first.storage.backups.count, 1)
    assert.ok((first.storage.projectRoot.totalBytes ?? 0) > 0)
    now += 1_000
    assert.equal(await service.snapshot(), first)
    assert.equal(journalCalls, 1)
  })

  it('isolates tmux, storage, backup, and journal failures', async () => {
    const service = new OperationalStatusService({
      environment: readEnvironment({
        TERMSPACE_DATABASE_PATH: '/definitely/missing/database',
        TERMSPACE_PROJECT_ROOT: '/definitely/missing/projects',
        TERMSPACE_BACKUP_DIRECTORY: '/definitely/missing/backups',
      }),
      sessions: { list: () => [] },
      tmux: { listSessionIds: async () => { throw new Error('tmux unavailable') } },
      journal: { runBounded: async () => { throw new Error('journal unavailable') } },
    })
    const snapshot = await service.snapshot()
    assert.deepEqual(snapshot.tmux, {
      health: 'unavailable', liveSessions: null, persistedSessions: 0,
    })
    assert.equal(snapshot.storage.databaseBytes, null)
    assert.equal(snapshot.storage.projectRoot.totalBytes, null)
    assert.equal(snapshot.storage.backups.count, null)
    assert.equal(snapshot.eventsAvailable, false)
    assert.deepEqual(snapshot.recentEvents, [])
  })
})

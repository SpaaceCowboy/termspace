'use client'

import type { OperationalHealth, OperationalStatus } from '@termspace/contracts'
import { useCallback, useEffect, useState } from 'react'

import { dataSource } from '@/lib/data'
import { cx } from '@/lib/cx'

import { Dialog } from './Dialog'
import styles from './OperationsDialog.module.css'

const EVENT_LEVEL_CLASS = {
  info: styles.eventInfo,
  warn: styles.eventWarn,
  error: styles.eventError,
} as const

export function OperationsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<OperationalStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const response = await dataSource.operations()
    if (response.ok) {
      setStatus(response.data)
      setError(null)
    } else {
      setError(response.error.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    const timer = setInterval(() => { void load() }, 15_000)
    return () => { clearInterval(timer) }
  }, [load, open])

  return (
    <Dialog open={open} onClose={onClose} title="Operations" size="wide">
      <div className={styles.intro}>
        <p>Live system health and recovery signals. Refreshes every 15 seconds.</p>
        <button type="button" onClick={() => { void load() }} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {status === null && loading ? <OperationsSkeleton /> : null}
      {error !== null ? (
        <div className={styles.errorState} role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => { void load() }}>Try again</button>
        </div>
      ) : null}
      {status === null ? null : <Operations status={status} />}
    </Dialog>
  )
}

function Operations({ status }: { status: OperationalStatus }) {
  const used = status.storage.projectRoot.totalBytes !== null && status.storage.projectRoot.availableBytes !== null
    ? status.storage.projectRoot.totalBytes - status.storage.projectRoot.availableBytes
    : null
  const usedPercent = used === null || status.storage.projectRoot.totalBytes === null
    ? null
    : Math.round((used / status.storage.projectRoot.totalBytes) * 100)
  return (
    <div className={styles.content}>
      <div className={styles.cards}>
        <Metric title="Gateway" health={status.gateway.health} value={`v${status.gateway.version}`} detail={`${duration(status.gateway.uptimeMs)} uptime`} />
        <Metric title="tmux" health={status.tmux.health} value={status.tmux.liveSessions === null ? 'Unavailable' : `${String(status.tmux.liveSessions)} live`} detail={`${String(status.tmux.persistedSessions)} persisted`} />
        <Metric title="Project storage" value={usedPercent === null ? 'Unavailable' : `${String(usedPercent)}% used`} detail={status.storage.projectRoot.availableBytes === null ? status.storage.projectRoot.path : `${bytes(status.storage.projectRoot.availableBytes)} available`} />
        <Metric title="Backups" health={status.storage.backups.count === null ? 'unavailable' : 'healthy'} value={status.storage.backups.count === null ? 'Unavailable' : `${String(status.storage.backups.count)} retained`} detail={status.storage.backups.latestAt === null ? 'No backup yet' : `Latest ${relativeTime(status.storage.backups.latestAt, status.generatedAt)}`} />
      </div>
      <section className={styles.section}>
        <h3>Policies</h3>
        <dl className={styles.policy}>
          <div><dt>Session memory</dt><dd>{bytes(status.policy.sessionMemoryMaxBytes)}</dd></div>
          <div><dt>Idle cleanup</dt><dd>{duration(status.policy.idleSessionGraceMs)}</dd></div>
          <div><dt>Backup retention</dt><dd>{String(status.policy.backupRetentionCount)}</dd></div>
          <div><dt>Database</dt><dd>{status.storage.databaseBytes === null ? 'Unavailable' : bytes(status.storage.databaseBytes)}</dd></div>
        </dl>
      </section>
      <section className={styles.section}>
        <h3>Recent events</h3>
        {!status.eventsAvailable ? (
          <p className={styles.muted}>The system journal is unavailable. Other metrics are still live.</p>
        ) : status.recentEvents.length === 0 ? (
          <p className={styles.muted}>No allowlisted operational events yet.</p>
        ) : (
          <ul className={styles.events}>
            {status.recentEvents.map((event, index) => (
              <li key={`${String(event.at)}-${String(index)}`}>
                <span className={cx(styles.eventDot, EVENT_LEVEL_CLASS[event.level])} aria-hidden="true" />
                <span>{event.summary}</span>
                <time dateTime={new Date(event.at).toISOString()}>{relativeTime(event.at, status.generatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={styles.updated}>Updated {new Date(status.generatedAt).toLocaleTimeString()}</p>
    </div>
  )
}

function Metric({ title, health = 'healthy', value, detail }: { title: string; health?: OperationalHealth; value: string; detail: string }) {
  return <section className={styles.metric}><div><span className={cx(styles.health, styles[health])} aria-hidden="true" /><h3>{title}</h3></div><strong>{value}</strong><p>{detail}</p></section>
}

function OperationsSkeleton() {
  return <div className={styles.cards} role="status" aria-label="Loading operational status">{[0, 1, 2, 3].map((item) => <div className={styles.skeleton} key={item} />)}</div>
}

function bytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unit = 0
  while (amount >= 1_024 && unit < units.length - 1) { amount /= 1_024; unit += 1 }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`
}

function duration(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000)
  if (hours >= 24) return `${String(Math.floor(hours / 24))}d`
  if (hours >= 1) return `${String(hours)}h`
  return `${String(Math.max(1, Math.floor(milliseconds / 60_000)))}m`
}

function relativeTime(at: number, now: number): string {
  const elapsed = Math.max(0, now - at)
  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${String(Math.floor(elapsed / 60_000))}m ago`
  if (elapsed < 86_400_000) return `${String(Math.floor(elapsed / 3_600_000))}h ago`
  return `${String(Math.floor(elapsed / 86_400_000))}d ago`
}

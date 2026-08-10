'use client'

import type { Session } from '@termspace/contracts'
import { useEffect, useState } from 'react'

import { PanePlaceholder } from '@/components/PanePlaceholder'
import { Sidebar } from '@/components/Sidebar'
import { dataSource } from '@/lib/data'

import styles from './workspace.module.css'

export default function WorkspacePage() {
  const [sessions, setSessions] = useState<readonly Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    dataSource
      .listSessions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) {
          return
        }
        if (!response.ok) {
          setError(response.error.message)
          setSessions([])
          return
        }
        setError(null)
        setSessions(response.data)
        setSelectedId(response.data[0]?.id ?? null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setError(cause instanceof Error ? cause.message : 'Could not load sessions.')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [])

  const selected = sessions.find((session) => session.id === selectedId) ?? null

  return (
    <div className={styles.shell}>
      <a className="ts-skip-link" href="#workspace-main">
        Skip to terminals
      </a>
      <Sidebar
        sessions={sessions}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
        error={error}
        sourceKind={dataSource.kind}
      />
      <main className={styles.main} id="workspace-main">
        <div className={styles.topbar}>
          <p className={styles.crumbs}>
            workspace / <span className={styles.crumbCurrent}>{selected?.name ?? 'no session'}</span>
          </p>
          <span className={styles.connection}>
            <span className={styles.connectionDot} aria-hidden="true" />
            not connected
          </span>
        </div>
        <div className={styles.grid}>
          <PanePlaceholder session={selected} />
        </div>
      </main>
    </div>
  )
}

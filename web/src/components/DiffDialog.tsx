'use client'

import type { DiffFile, DiffResult, Session } from '@termspace/contracts'
import { useEffect, useMemo, useState } from 'react'

import { dataSource } from '@/lib/data'
import { parseDiffLines, type DiffLineKind } from '@/lib/diff-lines.ts'

import { Dialog } from './Dialog'
import styles from './DiffDialog.module.css'

export interface DiffDialogProps {
  readonly open: boolean
  readonly sessions: readonly Session[]
  readonly onClose: () => void
}

export function DiffDialog({ open, sessions, onClose }: DiffDialogProps) {
  const [diffs, setDiffs] = useState<Readonly<Record<string, DiffResult>>>({})
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const sessionKey = sessions.map(({ id }) => id).join(',')

  useEffect(() => {
    if (!open || sessionKey === '') {
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setErrors({})
    setDiffs({})
    const sessionIds = sessionKey.split(',')
    Promise.all(sessionIds.map(async (sessionId) => {
      try {
        const response = await dataSource.sessionDiff(sessionId, controller.signal)
        return response.ok
          ? { sessionId, diff: response.data, error: null }
          : { sessionId, diff: null, error: response.error.message }
      } catch (cause) {
        return {
          sessionId,
          diff: null,
          error: cause instanceof Error ? cause.message : 'Could not load the diff.',
        }
      }
    }))
      .then((results) => {
        if (controller.signal.aborted) return
        setDiffs(Object.fromEntries(
          results.flatMap((result) => result.diff === null ? [] : [[result.sessionId, result.diff]]),
        ))
        setErrors(Object.fromEntries(
          results.flatMap((result) => result.error === null ? [] : [[result.sessionId, result.error]]),
        ))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
    }
  }, [open, reload, sessionKey])

  const title = sessions.length > 1
    ? 'Review changes side by side'
    : `Changes · ${sessions[0]?.name ?? 'session'}`

  return (
    <Dialog open={open} title={title} onClose={onClose} size="wide">
      <div className={sessions.length > 1 ? styles.comparison : undefined}>
        {sessions.map((session) => (
          <DiffReview
            key={session.id}
            session={session}
            diff={diffs[session.id] ?? null}
            error={errors[session.id] ?? null}
            loading={loading}
            onReload={() => { setReload((value) => value + 1) }}
            compact={sessions.length > 1}
          />
        ))}
      </div>
    </Dialog>
  )
}

interface DiffReviewProps {
  readonly compact: boolean
  readonly diff: DiffResult | null
  readonly error: string | null
  readonly loading: boolean
  readonly onReload: () => void
  readonly session: Session
}

function DiffReview({ compact, diff, error, loading, onReload, session }: DiffReviewProps) {
  const lines = useMemo(() => parseDiffLines(diff?.patch ?? ''), [diff?.patch])
  return (
    <section className={`${styles.review} ${compact ? styles.reviewCard : ''}`}>
      {compact ? <h3 className={styles.sessionTitle}>{session.name}</h3> : null}
      {loading ? <p className={styles.message} role="status">Loading changes…</p> : null}
      {error === null ? null : (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <button type="button" onClick={onReload}>Try again</button>
        </div>
      )}
      {diff === null ? null : (
        <>
          <div className={styles.summary}>
            <span>{diff.files.length} changed {diff.files.length === 1 ? 'file' : 'files'}</span>
            <span>against <code>{diff.baseBranch}</code></span>
            <button type="button" onClick={onReload}>Refresh</button>
          </div>
          {diff.truncated ? (
            <p className={styles.warning} role="status">
              This diff reached a safety limit. The file list or patch below is partial.
            </p>
          ) : null}
          <div className={styles.columns}>
            <section className={styles.files} aria-label={`Changed files for ${session.name}`}>
              <h3>Files</h3>
              {diff.files.length === 0 ? (
                <p className={styles.empty}>No changes against {diff.baseBranch}.</p>
              ) : (
                <ul>
                  {diff.files.map((file) => <FileRow key={`${file.status}:${file.path}`} file={file} />)}
                </ul>
              )}
            </section>
            <section className={styles.patch} aria-label={`Unified diff for ${session.name}`}>
              <h3>Unified diff</h3>
              {lines.length === 0 ? (
                <p className={styles.empty}>
                  No tracked text patch. Untracked and binary files are listed above.
                </p>
              ) : (
                <pre className={styles.code} tabIndex={0}>
                  {lines.map((line) => (
                    <span className={lineClass(line.kind)} key={line.number}>
                      <span className={styles.lineNumber} aria-hidden="true">{line.number}</span>
                      <span>{line.text || ' '}</span>{'\n'}
                    </span>
                  ))}
                </pre>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  )
}

function FileRow({ file }: { readonly file: DiffFile }) {
  return (
    <li className={styles.file}>
      <span className={`${styles.status} ${styles[file.status]}`}>{statusLabel(file)}</span>
      <span className={styles.path} title={file.path}>
        {file.previousPath === null ? file.path : `${file.previousPath} → ${file.path}`}
      </span>
      <span className={styles.stats}>
        {file.binary ? 'binary' : (
          <>
            {file.additions === null ? null : <span className={styles.additions}>+{file.additions}</span>}
            {file.deletions === null ? null : <span className={styles.deletions}>−{file.deletions}</span>}
          </>
        )}
      </span>
    </li>
  )
}

function statusLabel(file: DiffFile): string {
  const labels: Record<DiffFile['status'], string> = {
    added: 'A', copied: 'C', conflicted: '!', deleted: 'D', modified: 'M', renamed: 'R', untracked: '?',
  }
  return labels[file.status]
}

function lineClass(kind: DiffLineKind): string {
  return `${styles.line} ${styles[kind === 'file-header' ? 'fileHeader' : kind]}`
}

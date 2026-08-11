'use client'

import { AGENT_KINDS, type AgentKind, type Project, type Session } from '@termspace/contracts'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { dataSource } from '@/lib/data'

import { Dialog } from './Dialog'
import styles from './Form.module.css'

const AGENT_LABEL: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  shell: 'Shell',
}

export interface NewSessionDialogProps {
  open: boolean
  projects: readonly Project[]
  /** Which project the `+` was pressed on. */
  initialProjectId: string | null
  onClose: () => void
  onCreated: (session: Session) => void
}

export function NewSessionDialog({
  open,
  projects,
  initialProjectId,
  onClose,
  onCreated,
}: NewSessionDialogProps) {
  const projectId = useId()
  const nameId = useId()
  const agentId = useId()

  const [project, setProject] = useState('')
  const [name, setName] = useState('')
  const [agent, setAgent] = useState<AgentKind>('claude')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reopening must not show the previous attempt's error or a stale project.
  useEffect(() => {
    if (!open) {
      return
    }
    setProject(initialProjectId ?? projects[0]?.id ?? '')
    setName('')
    setAgent('claude')
    setError(null)
    setSubmitting(false)
  }, [open, initialProjectId, projects])

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) {
      return
    }
    const trimmed = name.trim()
    if (project === '') {
      setError('Pick a project first.')
      return
    }
    if (trimmed === '') {
      setError('Give the session a name.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const response = await dataSource.createSession({
        projectId: project,
        name: trimmed,
        agent,
      })
      if (!response.ok) {
        setError(response.error.message)
        return
      }
      onCreated(response.data)
    } catch {
      setError('Could not reach the Termspace server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} title="New session" onClose={onClose}>
      {projects.length === 0 ? (
        <>
          <p className={styles.empty}>
            A session belongs to a project, and there are none yet. Add a project first.
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.button} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            void onSubmit(event)
          }}
          noValidate
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor={projectId}>
              Project
            </label>
            <select
              className={styles.select}
              id={projectId}
              value={project}
              onChange={(event) => setProject(event.target.value)}
              disabled={submitting}
            >
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={nameId}>
              Name
            </label>
            <input
              className={styles.input}
              id={nameId}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={agentId}>
              Agent
            </label>
            <select
              className={styles.select}
              id={agentId}
              value={agent}
              onChange={(event) => setAgent(event.target.value as AgentKind)}
              disabled={submitting}
            >
              {AGENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {AGENT_LABEL[kind]}
                </option>
              ))}
            </select>
            <span className={styles.hint}>
              Starts in the project directory. Shell leaves you at a prompt.
            </span>
          </div>

          {error !== null ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${styles.button} ${styles.primary}`}
              disabled={submitting}
            >
              {submitting ? 'Starting…' : 'Start session'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

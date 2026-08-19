'use client'

import {
  AGENT_KINDS,
  type AgentAvailability,
  type AgentCommand,
  type AgentKind,
  type Project,
  type Session,
} from '@termspace/contracts'
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'

import { dataSource } from '@/lib/data'
import { formatCommand } from '@/lib/agent-command-text.ts'

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
  initialAgent?: AgentKind
  defaultAgentCommands: Record<AgentKind, AgentCommand> | null
  agentAvailability: Record<AgentKind, AgentAvailability> | null
  onClose: () => void
  onCreated: (session: Session) => void
}

export function NewSessionDialog({
  open,
  projects,
  initialProjectId,
  initialAgent,
  defaultAgentCommands,
  agentAvailability,
  onClose,
  onCreated,
}: NewSessionDialogProps) {
  const projectId = useId()
  const nameId = useId()
  const agentId = useId()
  const worktreeId = useId()
  const branchId = useId()
  const promptId = useId()

  const [project, setProject] = useState('')
  const [name, setName] = useState('')
  const [agent, setAgent] = useState<AgentKind>('claude')
  const [worktree, setWorktree] = useState(false)
  const [branch, setBranch] = useState('')
  const [branchTouched, setBranchTouched] = useState(false)
  const [initialPrompt, setInitialPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reopening must not show the previous attempt's error or a stale project.
  useEffect(() => {
    if (!open) {
      return
    }
    setProject(initialProjectId ?? projects[0]?.id ?? '')
    setName('')
    setAgent(firstAvailableAgent(initialAgent, agentAvailability))
    setWorktree(false)
    setBranch('')
    setBranchTouched(false)
    setInitialPrompt('')
    setError(null)
    setSubmitting(false)
  }, [agentAvailability, initialAgent, open, initialProjectId, projects])

  const selectedProject = useMemo(
    () => projects.find((candidate) => candidate.id === project) ?? null,
    [project, projects],
  )
  const launchCommand = selectedProject?.agentCommands[agent]
    ?? defaultAgentCommands?.[agent]
    ?? []
  const customCommand = selectedProject?.agentCommands[agent] !== undefined
  const selectedAvailability = customCommand
    ? null
    : (agentAvailability?.[agent] ?? null)

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
    const trimmedBranch = branch.trim()
    if (worktree && trimmedBranch === '') {
      setError('Give the worktree branch a name.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const response = await dataSource.createSession(
        worktree
          ? {
              projectId: project,
              name: trimmed,
              agent,
              ...(initialPrompt.trim() === '' ? {} : { initialPrompt: initialPrompt.trim() }),
              worktree: true,
              worktreeBranch: trimmedBranch,
            }
          : {
              projectId: project,
              name: trimmed,
              agent,
              ...(initialPrompt.trim() === '' ? {} : { initialPrompt: initialPrompt.trim() }),
            },
      )
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
            {selectedProject === null ? null : (
              <span className={`${styles.hint} ${styles.mono}`}>{selectedProject.path}</span>
            )}
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
              onChange={(event) => {
                const next = event.target.value
                setName(next)
                if (!branchTouched) {
                  setBranch(suggestBranch(next))
                }
              }}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              maxLength={128}
              required
            />
          </div>

          <label className={styles.choice} htmlFor={worktreeId}>
            <input
              id={worktreeId}
              type="checkbox"
              checked={worktree}
              onChange={(event) => setWorktree(event.target.checked)}
              disabled={submitting}
            />
            <span>
              <strong>Isolated worktree</strong>
              <span className={styles.hint}>
                Create a new branch and working directory for parallel work.
              </span>
            </span>
          </label>

          {worktree ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor={branchId}>
                Branch
              </label>
              <input
                className={`${styles.input} ${styles.mono}`}
                id={branchId}
                type="text"
                value={branch}
                onChange={(event) => {
                  setBranch(event.target.value)
                  setBranchTouched(true)
                }}
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
                maxLength={255}
                required
              />
              <span className={styles.hint}>
                The branch must be new. Deleting the session keeps its commits and branch.
              </span>
            </div>
          ) : null}

          <fieldset className={styles.fieldset} id={agentId}>
            <legend className={styles.label}>Agent</legend>
            <div className={styles.agentGrid}>
              {AGENT_KINDS.map((kind) => {
                const projectOverride = selectedProject?.agentCommands[kind]
                const availability = projectOverride === undefined
                  ? agentAvailability?.[kind]
                  : null
                const unavailable = availability?.available === false
                return (
                  <label className={styles.agentChoice} key={kind}>
                    <input
                      type="radio"
                      name={agentId}
                      value={kind}
                      checked={agent === kind}
                      onChange={() => {
                        setAgent(kind)
                        if (kind === 'shell') setInitialPrompt('')
                      }}
                      disabled={submitting || unavailable}
                    />
                    <span>
                      <strong>{AGENT_LABEL[kind]}</strong>
                      <small className={unavailable ? styles.unavailable : styles.available}>
                        {availability === null
                          ? 'custom command'
                          : unavailable
                            ? `${availability.command ?? kind} not installed`
                            : 'available'}
                      </small>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={promptId}>Initial prompt <span className={styles.optional}>optional</span></label>
            <textarea
              className={`${styles.input} ${styles.textarea}`}
              id={promptId}
              value={initialPrompt}
              onChange={(event) => { setInitialPrompt(event.target.value) }}
              disabled={submitting || agent === 'shell'}
              placeholder={agent === 'shell' ? 'Shell starts at an interactive prompt.' : 'What should the agent do first?'}
              maxLength={8192}
              rows={3}
            />
            <span className={styles.hint}>Sent literally after the agent starts; it is never interpreted as a shell command.</span>
          </div>

          <details className={styles.advanced}>
            <summary>Advanced launch details</summary>
            <dl className={styles.launchDetails}>
              <div><dt>Directory</dt><dd>{selectedProject?.path ?? 'Select a project'}</dd></div>
              <div><dt>Workspace</dt><dd>{worktree ? `New worktree · ${branch || 'branch required'}` : 'Shared project directory'}</dd></div>
              <div><dt>Command</dt><dd>{launchCommand.length === 0 ? 'Login shell' : formatCommand(launchCommand)}</dd></div>
              <div><dt>Check</dt><dd>{selectedAvailability?.available === false ? 'Unavailable' : customCommand ? 'Custom command checked on start' : 'Ready'}</dd></div>
            </dl>
          </details>

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

function suggestBranch(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug === '' ? '' : `ts/${slug}`
}

function firstAvailableAgent(
  preferred: AgentKind | undefined,
  availability: Record<AgentKind, AgentAvailability> | null,
): AgentKind {
  if (preferred !== undefined && availability?.[preferred]?.available !== false) return preferred
  return AGENT_KINDS.find((kind) => availability?.[kind]?.available !== false) ?? 'shell'
}

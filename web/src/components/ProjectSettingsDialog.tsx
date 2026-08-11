'use client'

import {
  AGENT_KINDS,
  type AgentCommandOverrides,
  type AgentKind,
  type Project,
} from '@termspace/contracts'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { cx } from '@/lib/cx'
import {
  CommandTextError,
  formatCommand,
  parseCommandText,
} from '@/lib/agent-command-text.ts'
import { dataSource } from '@/lib/data'

import { Dialog } from './Dialog'
import styles from './Form.module.css'

const AGENT_LABEL: Record<AgentKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  shell: 'Shell',
}

export interface ProjectSettingsDialogProps {
  open: boolean
  project: Project | null
  /** Server defaults, shown as the placeholder so the real command is visible. */
  defaultAgentCommands: Record<AgentKind, readonly string[]> | null
  onClose: () => void
  onSaved: (project: Project) => void
}

type Draft = Record<AgentKind, string>

function toDraft(project: Project | null): Draft {
  const overrides = project?.agentCommands ?? {}
  return Object.fromEntries(
    AGENT_KINDS.map((kind) => {
      const command = overrides[kind]
      return [kind, command === undefined ? '' : formatCommand(command)]
    }),
  ) as Draft
}

/**
 * A blank field means "no override" and an explicitly emptied one cannot be
 * distinguished from it, which is why clearing a field restores the default
 * rather than launching nothing. Launching nothing is what the Shell kind is
 * for, and its default is already empty.
 */
function toOverrides(draft: Draft): AgentCommandOverrides {
  let overrides: AgentCommandOverrides = {}
  for (const kind of AGENT_KINDS) {
    const text = draft[kind].trim()
    if (text === '') {
      continue
    }
    overrides = { ...overrides, [kind]: parseCommandText(text) }
  }
  return overrides
}

export function ProjectSettingsDialog({
  open,
  project,
  defaultAgentCommands,
  onClose,
  onSaved,
}: ProjectSettingsDialogProps) {
  const fieldId = useId()
  const [draft, setDraft] = useState<Draft>(() => toDraft(project))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Reopening on a different project must not show the previous one's commands.
  useEffect(() => {
    if (!open) {
      return
    }
    setDraft(toDraft(project))
    setError(null)
    setSubmitting(false)
  }, [open, project])

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting || project === null) {
      return
    }

    let agentCommands: AgentCommandOverrides
    try {
      agentCommands = toOverrides(draft)
    } catch (parseError) {
      setError(
        parseError instanceof CommandTextError
          ? parseError.message
          : 'That command could not be read.',
      )
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const response = await dataSource.updateProject(project.id, { agentCommands })
      if (!response.ok) {
        setError(response.error.message)
        return
      }
      onSaved(response.data)
    } catch {
      setError('Could not reach the Termspace server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={project === null ? 'Project settings' : `${project.name} — launch commands`}
      onClose={onClose}
    >
      {project === null ? (
        <>
          <p className={styles.empty}>That project is no longer here.</p>
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
          <p className={styles.hint}>
            What each kind of session runs when it starts in this project. Leave a
            field blank to use the default. Quote an argument that contains a
            space; nothing else is interpreted, because the command is run
            directly rather than through a shell.
          </p>

          {AGENT_KINDS.map((kind) => {
            const fallback = defaultAgentCommands?.[kind] ?? []
            return (
              <div className={styles.field} key={kind}>
                <label className={styles.label} htmlFor={`${fieldId}-${kind}`}>
                  {AGENT_LABEL[kind]}
                </label>
                <input
                  className={cx(styles.input, styles.mono)}
                  id={`${fieldId}-${kind}`}
                  type="text"
                  value={draft[kind]}
                  spellCheck={false}
                  autoComplete="off"
                  placeholder={
                    fallback.length === 0
                      ? 'Default: the login shell'
                      : `Default: ${formatCommand(fallback)}`
                  }
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, [kind]: event.target.value }))
                  }}
                  disabled={submitting}
                />
              </div>
            )
          })}

          {error === null ? null : (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

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
              className={cx(styles.button, styles.primary)}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

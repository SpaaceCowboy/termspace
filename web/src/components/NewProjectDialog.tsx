'use client'

import type { CreateProjectInput, Project } from '@termspace/contracts'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { dataSource } from '@/lib/data'
import { suggestProjectPath } from '@/lib/project-path'

import { Dialog } from './Dialog'
import styles from './Form.module.css'

/**
 * Where the code comes from. This used to be inferred from whether the repo
 * field was empty, which meant the obvious path — type a name, take the
 * suggested directory, submit — always failed: the suggestion is a directory
 * that does not exist yet, and adopting requires one that does.
 */
type Source = 'create' | 'existing' | 'clone'

const SOURCE_LABELS: Readonly<Record<Source, string>> = {
  create: 'Start empty',
  existing: 'Use a directory already on the server',
  clone: 'Clone a repository',
}

const SOURCE_HINTS: Readonly<Record<Source, string>> = {
  create: 'The server creates the directory. Nothing is cloned.',
  existing: 'The directory must already be there.',
  clone: 'The directory must not exist yet — git makes it.',
}

export interface NewProjectDialogProps {
  open: boolean
  /** Where project directories must live. `null` until `GET /api/config` lands. */
  projectRoot: string | null
  /** False when the server cannot write to the root; every create would fail. */
  projectRootWritable?: boolean
  onClose: () => void
  onCreated: (project: Project) => void
}

export function NewProjectDialog({
  open,
  projectRoot,
  projectRootWritable = true,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const nameId = useId()
  const pathId = useId()
  const repoId = useId()
  const branchId = useId()
  const sourceName = useId()

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [pathEdited, setPathEdited] = useState(false)
  const [source, setSource] = useState<Source>('create')
  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setName('')
    setPath('')
    setPathEdited(false)
    setSource('create')
    setRepoUrl('')
    setBranch('')
    setError(null)
    setSubmitting(false)
  }, [open])

  // The path has to be inside the root, so type the name and get one for free.
  // Stop the moment the field is touched, or we would fight the user.
  const shownPath = pathEdited ? path : suggestProjectPath(projectRoot, name)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) {
      return
    }
    const trimmedName = name.trim()
    const trimmedPath = shownPath.trim()
    const trimmedRepo = repoUrl.trim()
    if (trimmedName === '') {
      setError('Give the project a name.')
      return
    }
    if (!trimmedPath.startsWith('/')) {
      setError('The directory must be an absolute path.')
      return
    }
    if (source === 'clone' && trimmedRepo === '') {
      setError('Give the repository URL to clone, or choose another source.')
      return
    }

    const input: CreateProjectInput = {
      name: trimmedName,
      path: trimmedPath,
      ...(source === 'clone' ? { repoUrl: trimmedRepo } : {}),
      ...(source === 'create' ? { createDirectory: true } : {}),
      ...(branch.trim() === '' ? {} : { defaultBranch: branch.trim() }),
    }

    setError(null)
    setSubmitting(true)
    try {
      const response = await dataSource.createProject(input)
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
    <Dialog open={open} title="New project" onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          void onSubmit(event)
        }}
        noValidate
      >
        {projectRootWritable ? null : (
          <p className={styles.error} role="alert">
            The server cannot write to {projectRoot ?? 'its project root'}. Projects
            cannot be created until it exists and is writable — set
            TERMSPACE_PROJECT_ROOT to a directory the server owns and restart it.
          </p>
        )}

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
            maxLength={128}
            required
          />
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Where the code comes from</legend>
          {(['create', 'existing', 'clone'] as const).map((candidate) => (
            <label className={styles.choice} key={candidate}>
              <input
                type="radio"
                name={sourceName}
                value={candidate}
                checked={source === candidate}
                onChange={() => {
                  setSource(candidate)
                }}
                disabled={submitting}
              />
              <span>
                {SOURCE_LABELS[candidate]}
                <span className={styles.hint}> — {SOURCE_HINTS[candidate]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={pathId}>
            Directory
          </label>
          <input
            className={`${styles.input} ${styles.mono}`}
            id={pathId}
            type="text"
            value={shownPath}
            onChange={(event) => {
              setPathEdited(true)
              setPath(event.target.value)
            }}
            disabled={submitting}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <span className={styles.hint}>
            {projectRoot === null
              ? 'Must be an absolute path.'
              : `Must be inside ${projectRoot}.`}
          </span>
        </div>

        {source === 'clone' ? (
          <>
            <div className={styles.field}>
              <label className={styles.label} htmlFor={repoId}>
                Repository URL
              </label>
              <input
                className={`${styles.input} ${styles.mono}`}
                id={repoId}
                type="text"
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
                placeholder="git@github.com:you/repo.git"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor={branchId}>
                Branch <span className={styles.hint}>— optional, defaults to main</span>
              </label>
              <input
                className={`${styles.input} ${styles.mono}`}
                id={branchId}
                type="text"
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                disabled={submitting}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </>
        ) : null}

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
            {submitting
              ? source === 'clone'
                ? 'Cloning…'
                : 'Adding…'
              : 'Add project'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

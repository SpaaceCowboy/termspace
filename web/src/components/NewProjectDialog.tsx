'use client'

import type { CreateProjectInput, Project } from '@termspace/contracts'
import { useEffect, useId, useState, type FormEvent } from 'react'

import { dataSource } from '@/lib/data'
import { suggestProjectPath } from '@/lib/project-path'

import { Dialog } from './Dialog'
import styles from './Form.module.css'

export interface NewProjectDialogProps {
  open: boolean
  /** Where project directories must live. `null` until `GET /api/config` lands. */
  projectRoot: string | null
  onClose: () => void
  onCreated: (project: Project) => void
}

export function NewProjectDialog({
  open,
  projectRoot,
  onClose,
  onCreated,
}: NewProjectDialogProps) {
  const nameId = useId()
  const pathId = useId()
  const repoId = useId()
  const branchId = useId()

  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [pathEdited, setPathEdited] = useState(false)
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
    if (trimmedName === '') {
      setError('Give the project a name.')
      return
    }
    if (!trimmedPath.startsWith('/')) {
      setError('The directory must be an absolute path.')
      return
    }

    const input: CreateProjectInput = {
      name: trimmedName,
      path: trimmedPath,
      ...(repoUrl.trim() === '' ? {} : { repoUrl: repoUrl.trim() }),
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

        <div className={styles.field}>
          <label className={styles.label} htmlFor={repoId}>
            Repository URL <span className={styles.hint}>— optional</span>
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
          />
          <span className={styles.hint}>
            Given one, the directory is cloned and must not exist yet. Left empty, the
            directory must already be there.
          </span>
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
            {submitting ? (repoUrl.trim() === '' ? 'Adding…' : 'Cloning…') : 'Add project'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

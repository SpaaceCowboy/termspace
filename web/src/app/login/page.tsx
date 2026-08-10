'use client'

import { isErrorCode, type ApiError } from '@termspace/contracts'
import { useRouter } from 'next/navigation'
import { useId, useState, type FormEvent } from 'react'

import { cx } from '@/lib/cx'
import { dataSource } from '@/lib/data'

import styles from './login.module.css'

function messageFor(error: ApiError): string {
  if (!isErrorCode(error.code)) {
    return error.message
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'That username, password, or code is not right.'
    case 'rate_limited':
      return 'Too many attempts. Wait a moment before trying again.'
    case 'validation_failed':
      return error.field === 'totp'
        ? 'The authentication code must be six digits.'
        : 'Check the details above and try again.'
    case 'unauthorized':
      return 'That session has expired. Sign in again.'
    case 'internal_error':
      return 'The server had a problem. Try again in a moment.'
    default:
      return error.message
  }
}

export default function LoginPage() {
  const router = useRouter()
  const usernameId = useId()
  const passwordId = useId()
  const totpId = useId()
  const totpHintId = useId()
  const statusId = useId()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) {
      return
    }
    setError(null)

    if (!/^\d{6}$/.test(totp)) {
      setError('The authentication code must be six digits.')
      return
    }

    setSubmitting(true)
    try {
      const response = await dataSource.login({ username, password, totp })
      if (!response.ok) {
        setError(messageFor(response.error))
        setTotp('')
        return
      }
      router.replace('/workspace')
    } catch {
      setError('Could not reach the Termspace server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.brand}>
          <span className={styles.brandMark}>▌</span>
          Termspace
        </h1>
        <p className={styles.subtitle}>Sign in to your workspace.</p>

        <form
          onSubmit={(event) => {
            void onSubmit(event)
          }}
          noValidate
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor={usernameId}>
              Username
            </label>
            <input
              className={styles.input}
              id={usernameId}
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={passwordId}>
              Password
            </label>
            <input
              className={styles.input}
              id={passwordId}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor={totpId}>
              Authentication code
            </label>
            <input
              className={cx(styles.input, styles.totp)}
              id={totpId}
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              aria-describedby={totpHintId}
              value={totp}
              onChange={(event) => setTotp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={submitting}
              required
            />
            <span className={styles.hint} id={totpHintId}>
              Six digits from your authenticator app.
            </span>
          </div>

          <button
            className={styles.submit}
            type="submit"
            disabled={submitting}
            aria-describedby={statusId}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className={cx(styles.notice, error !== null && styles.noticeError)} id={statusId}>
          <p role={error === null ? 'status' : 'alert'} aria-live="polite">
            {error ??
              (dataSource.kind === 'fixtures'
                ? 'Fixture mode — any six digits except 000000 will sign you in.'
                : 'Password and authenticator code are both required.')}
          </p>
        </div>
      </div>
    </main>
  )
}

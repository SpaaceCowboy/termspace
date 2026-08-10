'use client'

import { useId, useState, type FormEvent } from 'react'

import { cx } from '@/lib/cx'

import styles from './login.module.css'

export default function LoginPage() {
  const usernameId = useId()
  const passwordId = useId()
  const totpId = useId()
  const totpHintId = useId()
  const noticeId = useId()
  const [status, setStatus] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Sign-in is not wired up yet. Authentication lands in phase 1.')
  }

  return (
    <main className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.brand}>
          <span className={styles.brandMark}>▌</span>
          Termspace
        </h1>
        <p className={styles.subtitle}>Sign in to your workspace.</p>

        <form onSubmit={onSubmit} noValidate>
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
              required
            />
            <span className={styles.hint} id={totpHintId}>
              Six digits from your authenticator app.
            </span>
          </div>

          <button className={styles.submit} type="submit" aria-describedby={noticeId}>
            Sign in
          </button>
        </form>

        <div className={styles.notice} id={noticeId}>
          <p role="status" aria-live="polite">
            {status ?? 'Shell only — no credentials are sent anywhere yet.'}
          </p>
        </div>
      </div>
    </main>
  )
}

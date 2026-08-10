'use client'

import type { Session, SessionState } from '@termspace/contracts'
import { useEffect, useRef, useState } from 'react'

import { cx } from '@/lib/cx'
import type { SocketApi } from '@/lib/socket/useSocket.ts'

import styles from './TerminalPane.module.css'
import '@xterm/xterm/css/xterm.css'

const RESIZE_DEBOUNCE_MS = 100

const PILL_CLASS: Record<SessionState, string | undefined> = {
  working: styles.pillWorking,
  idle: undefined,
  'needs-you': styles.pillNeedsYou,
  dead: styles.pillDead,
}

export interface PaneHandle {
  restore: (data: string) => void
  write: (bytes: Uint8Array) => void
}

export interface TerminalPaneProps {
  session: Session
  socket: SocketApi
  register: (sid: string, handle: PaneHandle | null) => void
  notice: string | null
  dead: boolean
}

export function TerminalPane({ session, socket, register, notice, dead }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)
  const sid = session.id

  const socketRef = useRef(socket)
  socketRef.current = socket
  const registerRef = useRef(register)
  registerRef.current = register

  useEffect(() => {
    const container = containerRef.current
    if (container === null) {
      return
    }

    let disposed = false
    let dispose = (): void => {
      disposed = true
    }

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (disposed) {
        return
      }

      const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        scrollback: 5_000,
        theme: dark
          ? { background: '#0e1013', foreground: '#e6e6e3', cursor: '#4fd1a5' }
          : { background: '#ecebe7', foreground: '#1c1b19', cursor: '#1f6f5c' },
      })
      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(container)

      let inputDisposable: { dispose: () => void } | null = null
      let lastCols = 0
      let lastRows = 0

      const sendFit = (): void => {
        fitAddon.fit()
        if (terminal.cols !== lastCols || terminal.rows !== lastRows) {
          lastCols = terminal.cols
          lastRows = terminal.rows
          socketRef.current.sendResize(sid, terminal.cols, terminal.rows)
        }
      }

      registerRef.current(sid, {
        // Restore lands before input is wired, or the first keystrokes are
        // typed into a buffer the server is about to overwrite.
        restore: (data: string) => {
          terminal.reset()
          terminal.write(data, () => {
            if (inputDisposable === null) {
              inputDisposable = terminal.onData((chunk) => {
                socketRef.current.sendInput(sid, chunk)
              })
            }
            sendFit()
          })
        },
        write: (bytes: Uint8Array) => {
          terminal.write(bytes)
        },
      })

      socketRef.current.subscribe(sid, 'focused')

      let debounce: ReturnType<typeof setTimeout> | null = null
      const observer = new ResizeObserver(() => {
        if (debounce !== null) {
          clearTimeout(debounce)
        }
        debounce = setTimeout(() => {
          debounce = null
          if (!disposed) {
            sendFit()
          }
        }, RESIZE_DEBOUNCE_MS)
      })
      observer.observe(container)

      const onVisibility = (): void => {
        socketRef.current.sendVisibility(
          sid,
          document.visibilityState === 'visible' ? 'focused' : 'hidden',
        )
      }
      document.addEventListener('visibilitychange', onVisibility)

      const onFocus = (): void => {
        socketRef.current.sendVisibility(sid, 'focused')
      }
      const onBlur = (): void => {
        socketRef.current.sendVisibility(sid, 'visible')
      }
      container.addEventListener('focusin', onFocus)
      container.addEventListener('focusout', onBlur)

      dispose = () => {
        disposed = true
        if (debounce !== null) {
          clearTimeout(debounce)
        }
        document.removeEventListener('visibilitychange', onVisibility)
        container.removeEventListener('focusin', onFocus)
        container.removeEventListener('focusout', onBlur)
        observer.disconnect()
        inputDisposable?.dispose()
        registerRef.current(sid, null)
        socketRef.current.unsubscribe(sid)
        terminal.dispose()
      }
    })().catch(() => {
      if (!disposed) {
        setFailed(true)
      }
    })

    return () => {
      dispose()
    }
  }, [sid])

  return (
    <section className={styles.pane} aria-label={`Terminal: ${session.name}`}>
      <div className={styles.chrome}>
        <span className={styles.name}>
          {session.name}
          {session.title !== null ? <span className={styles.title}>— {session.title}</span> : null}
        </span>
        <span className={cx(styles.pill, PILL_CLASS[dead ? 'dead' : session.state])}>
          {dead ? 'dead' : session.state}
        </span>
      </div>
      {failed ? (
        <p className={styles.empty} role="alert">
          The terminal renderer failed to load. Reload the page to try again.
        </p>
      ) : (
        <div className={styles.screen} ref={containerRef} />
      )}
      {notice !== null ? (
        <p className={cx(styles.notice, dead && styles.noticeDead)} role="status">
          {notice}
        </p>
      ) : null}
    </section>
  )
}

import type { IDisposable, IPty } from 'node-pty'

import { parseSessionId } from '../sessions/session-id.js'
import type { TmuxAttachCommand } from '../tmux/tmux-client.js'

export interface PtySpawner {
  spawn(command: string, arguments_: string[]): IPty
}

export interface TmuxAttacher {
  attachCommand(untrustedId: unknown): TmuxAttachCommand
  detachClient(untrustedPid: unknown): Promise<boolean>
}

export interface ViewerAttachmentCallbacks {
  readonly onData: (data: string) => void
  readonly onExit: (event: { readonly exitCode: number }) => void
}

export class ViewerAttachment {
  readonly #dataSubscription: IDisposable
  readonly #detach: () => Promise<boolean>
  readonly #exitSubscription: IDisposable
  readonly #pty: IPty
  #closed = false
  #killTimer: NodeJS.Timeout | undefined

  constructor(
    pty: IPty,
    detach: () => Promise<boolean>,
    callbacks: ViewerAttachmentCallbacks,
  ) {
    this.#pty = pty
    this.#detach = detach
    this.#dataSubscription = pty.onData(callbacks.onData)
    this.#exitSubscription = pty.onExit(({ exitCode }) => {
      if (this.#killTimer !== undefined) {
        clearTimeout(this.#killTimer)
        this.#killTimer = undefined
      }
      this.#exitSubscription.dispose()
      if (!this.#closed) {
        callbacks.onExit({ exitCode })
      }
    })
  }

  write(data: string): void {
    if (!this.#closed) {
      this.#pty.write(data)
    }
  }

  resize(cols: number, rows: number): void {
    if (!this.#closed) {
      this.#pty.resize(cols, rows)
    }
  }

  close(): void {
    if (this.#closed) {
      return
    }
    this.#closed = true
    this.#dataSubscription.dispose()
    // Detach the exact tmux client by its node-pty child PID. Killing the PTY
    // first makes tmux 3.6 tear the client down mid-event and emit libevent's
    // `event_del_: event has no event_base set` warning. Keep a bounded fallback
    // so a racing or wedged client can never leak its PTY.
    this.#killTimer = setTimeout(() => {
      this.#killNow()
    }, 1_000)
    this.#killTimer.unref()
    void this.#detach()
      .then((detached) => {
        if (!detached) this.#killNow()
      })
      .catch(() => this.#killNow())
  }

  #killNow(): void {
    if (this.#killTimer !== undefined) {
      clearTimeout(this.#killTimer)
      this.#killTimer = undefined
    }
    this.#exitSubscription.dispose()
    try {
      this.#pty.kill()
    } catch {
      // A successful detach can win the race with fallback cleanup.
    }
  }
}

export class ViewerAttachmentFactory {
  readonly #spawner: PtySpawner
  readonly #tmux: TmuxAttacher

  constructor(spawner: PtySpawner, tmux: TmuxAttacher) {
    this.#spawner = spawner
    this.#tmux = tmux
  }

  attach(
    untrustedSessionId: unknown,
    callbacks: ViewerAttachmentCallbacks,
  ): ViewerAttachment {
    const sessionId = parseSessionId(untrustedSessionId)
    const command = this.#tmux.attachCommand(sessionId)
    const pty = this.#spawner.spawn(command.command, [...command.arguments_])
    return new ViewerAttachment(
      pty,
      () => this.#tmux.detachClient(pty.pid),
      callbacks,
    )
  }
}

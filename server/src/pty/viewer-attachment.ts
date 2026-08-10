import type { IDisposable, IPty } from 'node-pty'

import { parseSessionId } from '../sessions/session-id.js'

export interface PtySpawner {
  spawn(command: string, arguments_: string[]): IPty
}

export interface ViewerAttachmentCallbacks {
  readonly onData: (data: string) => void
  readonly onExit: (event: { readonly exitCode: number }) => void
}

export class ViewerAttachment {
  readonly #dataSubscription: IDisposable
  readonly #exitSubscription: IDisposable
  readonly #pty: IPty
  #closed = false

  constructor(pty: IPty, callbacks: ViewerAttachmentCallbacks) {
    this.#pty = pty
    this.#dataSubscription = pty.onData(callbacks.onData)
    this.#exitSubscription = pty.onExit(({ exitCode }) => {
      callbacks.onExit({ exitCode })
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
    this.#exitSubscription.dispose()
    this.#pty.kill()
  }
}

export class ViewerAttachmentFactory {
  readonly #spawner: PtySpawner

  constructor(spawner: PtySpawner) {
    this.#spawner = spawner
  }

  attach(
    untrustedSessionId: unknown,
    callbacks: ViewerAttachmentCallbacks,
  ): ViewerAttachment {
    const sessionId = parseSessionId(untrustedSessionId)
    const pty = this.#spawner.spawn('tmux', [
      'attach-session',
      '-t',
      `ts_${sessionId}`,
    ])
    return new ViewerAttachment(pty, callbacks)
  }
}

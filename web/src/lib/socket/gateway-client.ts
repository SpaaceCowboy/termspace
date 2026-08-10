import type { ClientFrame, ServerFrame, VisibilityLevel } from '@termspace/contracts'

import { backoffDelayMs, hasGivenUp } from './backoff.ts'
import { chunkInput, clampResize, decodeServerFrame, decodeTerminalOutput } from './frame-codec.ts'

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'dead'

export interface SocketLike {
  binaryType: string
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
}

export type TicketResult =
  | { readonly ok: true; readonly ticket: string }
  | { readonly ok: false; readonly fatal: boolean }

export interface GatewayClientOptions {
  requestTicket: () => Promise<TicketResult>
  socketUrl: string
  createSocket: (url: string) => SocketLike
  onState: (state: ConnectionState) => void
  onFrame: (frame: ServerFrame) => void
  onOutput: (sid: string, bytes: Uint8Array) => void
  setTimer?: (handler: () => void, delayMs: number) => number
  clearTimer?: (handle: number) => void
  random?: () => number
}

/**
 * One socket for the whole page. Panes register a subscription here; the client
 * owns reconnection and replays every subscription on reopen, because the
 * server treats a new connection as knowing nothing.
 */
export class GatewayClient {
  readonly #options: GatewayClientOptions
  readonly #subscriptions = new Map<string, VisibilityLevel>()
  readonly #setTimer: (handler: () => void, delayMs: number) => number
  readonly #clearTimer: (handle: number) => void
  readonly #random: () => number

  #socket: SocketLike | null = null
  #state: ConnectionState = 'connecting'
  #attempt = 0
  #retryHandle: number | null = null
  #disposed = false
  #connecting = false

  constructor(options: GatewayClientOptions) {
    this.#options = options
    this.#setTimer =
      options.setTimer ?? ((handler, delayMs) => globalThis.setTimeout(handler, delayMs) as never)
    this.#clearTimer = options.clearTimer ?? ((handle) => { globalThis.clearTimeout(handle) })
    this.#random = options.random ?? Math.random
  }

  get state(): ConnectionState {
    return this.#state
  }

  get subscribedIds(): readonly string[] {
    return [...this.#subscriptions.keys()]
  }

  connect(): void {
    if (this.#disposed || this.#connecting || this.#socket !== null) {
      return
    }
    void this.#openSocket()
  }

  subscribe(sid: string, level: VisibilityLevel = 'visible'): void {
    if (this.#disposed) {
      return
    }
    const known = this.#subscriptions.has(sid)
    this.#subscriptions.set(sid, level)
    if (!known) {
      this.#send({ t: 'sub', sid })
    }
    this.#send({ t: 'vis', sid, level })
  }

  unsubscribe(sid: string): void {
    if (!this.#subscriptions.delete(sid)) {
      return
    }
    this.#send({ t: 'unsub', sid })
  }

  sendInput(sid: string, data: string): void {
    for (const chunk of chunkInput(data)) {
      this.#send({ t: 'in', sid, data: chunk })
    }
  }

  sendResize(sid: string, cols: number, rows: number): void {
    const clamped = clampResize(cols, rows)
    this.#send({ t: 'resize', sid, cols: clamped.cols, rows: clamped.rows })
  }

  sendVisibility(sid: string, level: VisibilityLevel): void {
    if (this.#subscriptions.get(sid) === level) {
      return
    }
    if (this.#subscriptions.has(sid)) {
      this.#subscriptions.set(sid, level)
    }
    this.#send({ t: 'vis', sid, level })
  }

  ping(): void {
    this.#send({ t: 'ping' })
  }

  dispose(): void {
    this.#disposed = true
    this.#cancelRetry()
    this.#subscriptions.clear()
    this.#teardownSocket()
  }

  async #openSocket(): Promise<void> {
    this.#connecting = true
    this.#setState(this.#attempt === 0 ? 'connecting' : 'reconnecting')

    let ticket: TicketResult
    try {
      ticket = await this.#options.requestTicket()
    } catch {
      // A throwing ticket fetch must not wedge the client with #connecting stuck true.
      ticket = { ok: false, fatal: false }
    }
    if (this.#disposed) {
      this.#connecting = false
      return
    }
    if (!ticket.ok) {
      this.#connecting = false
      if (ticket.fatal) {
        this.#setState('dead')
        return
      }
      this.#scheduleRetry()
      return
    }

    let socket: SocketLike
    try {
      socket = this.#options.createSocket(
        `${this.#options.socketUrl}?ticket=${encodeURIComponent(ticket.ticket)}`,
      )
    } catch {
      this.#connecting = false
      this.#scheduleRetry()
      return
    }

    socket.binaryType = 'arraybuffer'
    socket.onopen = () => {
      this.#attempt = 0
      this.#setState('connected')
      for (const [sid, level] of this.#subscriptions) {
        this.#writeToSocket({ t: 'sub', sid })
        this.#writeToSocket({ t: 'vis', sid, level })
      }
    }
    socket.onerror = () => {
      socket.onerror = null
    }
    socket.onclose = () => {
      if (this.#socket !== socket) {
        return
      }
      this.#socket = null
      if (this.#disposed) {
        return
      }
      this.#scheduleRetry()
    }
    socket.onmessage = (event) => {
      this.#handleMessage(event.data)
    }

    this.#socket = socket
    this.#connecting = false
  }

  #handleMessage(data: unknown): void {
    if (typeof data === 'string') {
      const decoded = decodeServerFrame(data)
      if (decoded.ok) {
        this.#options.onFrame(decoded.frame)
      }
      return
    }
    if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
      const output = decodeTerminalOutput(data)
      if (output !== null) {
        this.#options.onOutput(output.sid, output.bytes)
      }
    }
  }

  #scheduleRetry(): void {
    if (this.#disposed || this.#retryHandle !== null) {
      return
    }
    this.#attempt += 1
    if (hasGivenUp(this.#attempt)) {
      this.#setState('dead')
      return
    }
    this.#setState('reconnecting')
    const delay = backoffDelayMs(this.#attempt, this.#random)
    this.#retryHandle = this.#setTimer(() => {
      this.#retryHandle = null
      void this.#openSocket()
    }, delay)
  }

  #cancelRetry(): void {
    if (this.#retryHandle !== null) {
      this.#clearTimer(this.#retryHandle)
      this.#retryHandle = null
    }
  }

  #teardownSocket(): void {
    const socket = this.#socket
    if (socket === null) {
      return
    }
    this.#socket = null
    socket.onopen = null
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    socket.close()
  }

  #send(frame: ClientFrame): void {
    if (this.#state !== 'connected' || this.#socket === null) {
      return
    }
    this.#writeToSocket(frame)
  }

  #writeToSocket(frame: ClientFrame): void {
    try {
      this.#socket?.send(JSON.stringify(frame))
    } catch {
      this.#teardownSocket()
      this.#scheduleRetry()
    }
  }

  #setState(state: ConnectionState): void {
    if (this.#state === state) {
      return
    }
    this.#state = state
    this.#options.onState(state)
  }
}

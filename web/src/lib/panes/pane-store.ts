import type { VisibilityLevel } from '@termspace/contracts'
import type { TerminalAppearance } from '@/lib/appearance.ts'

export const RESIZE_DEBOUNCE_MS = 100
export const DESTRUCTIVE_INPUT_CONFIRM_MS = 3_000

/**
 * Output can keep arriving while a pane is being rehosted between headless and
 * open. It is held rather than dropped, but not without a ceiling: a pane whose
 * rehost never finishes must not eat the tab's memory.
 */
const MAX_BUFFERED_BYTES = 1_048_576

/** Keystrokes held while waiting for the first `restore`. A human types slowly. */
const MAX_PENDING_INPUT_CHUNKS = 64

export type RendererKind = 'webgl' | 'dom'

export interface PaneSize {
  readonly cols: number
  readonly rows: number
}

export interface PaneDisposable {
  dispose: () => void
}

/**
 * The slice of `xterm.js` a pane needs, so the store can be tested without a
 * DOM and without a GPU. The adapter over the real `Terminal` lives next door
 * in `xterm-pane-terminal.ts`.
 */
export interface PaneTerminal {
  write: (data: string | Uint8Array) => void
  /** Resolves once everything written so far has landed in the buffer. */
  flush: () => Promise<void>
  reset: () => void
  open: (container: HTMLElement) => void
  /** Puts DOM focus on the terminal, without which it receives no keystrokes. */
  focus: () => void
  setRenderer: (kind: RendererKind) => void
  serialize: () => string
  /** Lines between the viewport and live output; zero means following output. */
  scrollOffsetFromBottom: () => number
  restoreScrollOffset: (offset: number) => void
  applyAppearance: (appearance: TerminalAppearance) => void
  fit: () => PaneSize | null
  onData: (handler: (data: string) => void) => PaneDisposable
  dispose: () => void
}

export interface PaneSocket {
  subscribe: (sid: string, level?: VisibilityLevel) => void
  unsubscribe: (sid: string) => void
  sendInput: (sid: string, data: string) => void
  sendResize: (sid: string, cols: number, rows: number) => void
  sendVisibility: (sid: string, level: VisibilityLevel) => void
}

export interface PaneRequest {
  readonly sid: string
  readonly visibility: VisibilityLevel
  /** `null` means off screen: the pane keeps a headless terminal instead. */
  readonly container: HTMLElement | null
}

export interface PaneStoreOptions {
  readonly createTerminal: () => Promise<PaneTerminal>
  readonly socket: PaneSocket
  readonly observeResize?: (element: HTMLElement, onResize: () => void) => PaneDisposable
  readonly schedule?: (handler: () => void, delayMs: number) => () => void
  readonly resizeDebounceMs?: number
  readonly onError?: (error: unknown) => void
  readonly onDestructiveInputArmed?: (sid: string, label: string) => void
  readonly now?: () => number
  readonly terminalAppearance: TerminalAppearance
}

interface PaneEntry {
  readonly sid: string
  visibility: VisibilityLevel
  container: HTMLElement | null
  terminal: PaneTerminal | null
  /** True once a `restore` has been applied to this pane's current terminal. */
  restored: boolean
  /** Keystrokes typed before the first restore landed, held rather than sent. */
  pendingInput: string[]
  input: PaneDisposable | null
  resize: PaneDisposable | null
  cancelResize: (() => void) | null
  buffered: (string | Uint8Array)[]
  bufferedBytes: number
  pending: number
  queue: Promise<void>
  lastSize: PaneSize | null
  released: boolean
  controlArmed: boolean
  pendingDestructive: { readonly data: string; readonly at: number } | null
}

/**
 * Owns one `xterm.js` terminal per subscribed session, outside React, so a
 * re-render or a layout change never costs a reattach.
 *
 * A pane that is not on screen holds a **headless** terminal: created, written
 * to, never `open()`ed. It stays subscribed, so its buffer is current the
 * instant it is shown. Moving between headless and open rehosts the terminal
 * through a serialized snapshot rather than asking the server for the screen
 * again, which is what makes the switch look instant.
 */
export class PaneStore {
  readonly #options: PaneStoreOptions
  readonly #panes = new Map<string, PaneEntry>()
  readonly #resizeDebounceMs: number
  readonly #now: () => number
  #disposed = false
  #terminalAppearance: TerminalAppearance

  setConnected(connected: boolean): void {
    if (connected) return
    // Keep every painted terminal intact, but hold new input until the fresh
    // server restore proves the replacement attachment is ready.
    for (const entry of this.#panes.values()) entry.restored = false
  }

  constructor(options: PaneStoreOptions) {
    this.#options = options
    this.#resizeDebounceMs = options.resizeDebounceMs ?? RESIZE_DEBOUNCE_MS
    this.#now = options.now ?? Date.now
    this.#terminalAppearance = options.terminalAppearance
  }

  setTerminalAppearance(appearance: TerminalAppearance): void {
    this.#terminalAppearance = appearance
    for (const entry of this.#panes.values()) {
      entry.terminal?.applyAppearance(appearance)
      entry.lastSize = null
      this.#fit(entry)
    }
  }

  get sessionIds(): readonly string[] {
    return [...this.#panes.keys()]
  }

  /**
   * Declarative: hand it the panes that should exist right now and it works out
   * the difference — subscribing what is new, releasing what is gone, and
   * rehosting what changed side.
   */
  sync(requests: readonly PaneRequest[]): void {
    if (this.#disposed) {
      return
    }
    const wanted = new Set<string>()
    for (const request of requests) {
      wanted.add(request.sid)
      const existing = this.#panes.get(request.sid)
      if (existing === undefined) {
        this.#create(request)
        continue
      }
      this.#update(existing, request)
    }
    for (const sid of [...this.#panes.keys()]) {
      if (!wanted.has(sid)) {
        this.#release(sid)
      }
    }
  }

  /**
   * A fresh screen from the server: on first subscribe and again on every
   * reconnect. Anything typed before it lands was held back, and goes out now
   * — the point of the rule is that keystrokes never act on a buffer the
   * server is about to overwrite, not that early keystrokes are thrown away.
   */
  restore(sid: string, data: string): void {
    const entry = this.#panes.get(sid)
    if (entry === undefined) {
      return
    }
    this.#enqueue(entry, async () => {
      const terminal = entry.terminal
      if (terminal === null) {
        return
      }
      const scrollOffset = terminal.scrollOffsetFromBottom()
      terminal.reset()
      entry.buffered = []
      entry.bufferedBytes = 0
      terminal.write(data)
      await terminal.flush()
      terminal.restoreScrollOffset(scrollOffset)
      entry.restored = true
      this.#flushInput(entry)
      this.#fit(entry)
      if (entry.visibility === 'focused' && entry.container !== null) terminal.focus()
    })
  }

  /**
   * Nothing else puts DOM focus on a terminal, and without it xterm's hidden
   * textarea never receives a keystroke — the pane renders output and swallows
   * every key. Queued behind the entry's operations so it cannot land on a
   * terminal that a rehost is about to replace.
   */
  focus(sid: string): void {
    const entry = this.#panes.get(sid)
    if (entry === undefined || entry.container === null) {
      return
    }
    this.#enqueue(entry, async () => {
      entry.terminal?.focus()
      await Promise.resolve()
    })
  }

  /** Input from the phone accessory bar follows the same restore/safety path as xterm input. */
  sendInput(sid: string, data: string): void {
    const entry = this.#panes.get(sid)
    if (entry !== undefined) {
      this.#acceptInput(entry, data)
    }
  }

  /** Arms Ctrl for the next character produced by either the soft keyboard or the bar. */
  setControlArmed(sid: string, armed: boolean): void {
    const entry = this.#panes.get(sid)
    if (entry !== undefined) {
      entry.controlArmed = armed
    }
  }

  write(sid: string, bytes: Uint8Array): void {
    const entry = this.#panes.get(sid)
    if (entry === undefined) {
      return
    }
    if (entry.pending > 0 || entry.terminal === null) {
      this.#buffer(entry, bytes)
      return
    }
    entry.terminal.write(bytes)
  }

  /** Every terminal, listener, observer, and timer this store ever made. */
  dispose(): void {
    if (this.#disposed) {
      return
    }
    this.#disposed = true
    for (const sid of [...this.#panes.keys()]) {
      this.#release(sid)
    }
  }

  #create(request: PaneRequest): void {
    const entry: PaneEntry = {
      sid: request.sid,
      visibility: request.visibility,
      container: request.container,
      terminal: null,
      restored: false,
      pendingInput: [],
      input: null,
      resize: null,
      cancelResize: null,
      buffered: [],
      bufferedBytes: 0,
      pending: 0,
      queue: Promise.resolve(),
      lastSize: null,
      released: false,
      controlArmed: false,
      pendingDestructive: null,
    }
    this.#panes.set(entry.sid, entry)
    this.#options.socket.subscribe(entry.sid, entry.visibility)
    this.#enqueue(entry, async () => {
      await this.#rehost(entry, request.container)
    })
  }

  #update(entry: PaneEntry, request: PaneRequest): void {
    if (entry.visibility !== request.visibility) {
      entry.visibility = request.visibility
      this.#options.socket.sendVisibility(entry.sid, request.visibility)
      if (entry.container !== null) {
        // Same terminal, different renderer: browsers cap live WebGL contexts,
        // so only the focused pane is allowed to hold one.
        const terminal = entry.terminal
        this.#enqueue(entry, async () => {
          terminal?.setRenderer(request.visibility === 'focused' ? 'webgl' : 'dom')
          await Promise.resolve()
        })
      }
    }
    if (entry.container !== request.container) {
      entry.container = request.container
      this.#enqueue(entry, async () => {
        await this.#rehost(entry, request.container)
      })
    }
  }

  /**
   * Moves a pane between headless and on-screen. The old terminal's screen is
   * serialized into the new one, so nothing is lost and nothing is re-fetched.
   */
  async #rehost(entry: PaneEntry, container: HTMLElement | null): Promise<void> {
    let snapshot = ''
    const previous = entry.terminal
    if (previous !== null) {
      await previous.flush()
      snapshot = previous.serialize()
      this.#teardownTerminal(entry)
    }

    const terminal = await this.#options.createTerminal()
    if (entry.released || this.#disposed) {
      terminal.dispose()
      return
    }
    entry.terminal = terminal
    terminal.applyAppearance(this.#terminalAppearance)
    entry.lastSize = null
    if (snapshot !== '') {
      terminal.write(snapshot)
    }

    if (container !== null) {
      terminal.open(container)
      terminal.setRenderer(entry.visibility === 'focused' ? 'webgl' : 'dom')
      entry.resize = this.#observeResize(container, () => {
        this.#scheduleFit(entry)
      })
      this.#fit(entry)
    }
    this.#wireInput(entry)
  }

  /**
   * Wired as soon as a terminal exists, so a pane can never end up permanently
   * unable to accept a keystroke because a `restore` went missing. Until that
   * restore lands the keystrokes are held, not sent.
   */
  #wireInput(entry: PaneEntry): void {
    const terminal = entry.terminal
    if (terminal === null || entry.input !== null) {
      return
    }
    entry.input = terminal.onData((chunk) => {
      this.#acceptInput(entry, chunk)
    })
  }

  #acceptInput(entry: PaneEntry, raw: string): void {
    const data = entry.controlArmed ? applyControlModifier(raw) : raw
    entry.controlArmed = false
    if (data === '\x03' || data === '\x04') {
      const now = this.#now()
      const pending = entry.pendingDestructive
      if (
        pending === null ||
        pending.data !== data ||
        now - pending.at > DESTRUCTIVE_INPUT_CONFIRM_MS
      ) {
        entry.pendingDestructive = { data, at: now }
        this.#options.onDestructiveInputArmed?.(
          entry.sid,
          data === '\x03' ? 'Ctrl+C' : 'Ctrl+D',
        )
        return
      }
      entry.pendingDestructive = null
    } else {
      entry.pendingDestructive = null
    }
    if (!entry.restored) {
      if (entry.pendingInput.length < MAX_PENDING_INPUT_CHUNKS) {
        entry.pendingInput.push(data)
      }
      return
    }
    this.#options.socket.sendInput(entry.sid, data)
  }

  #flushInput(entry: PaneEntry): void {
    if (entry.pendingInput.length === 0) {
      return
    }
    const pending = entry.pendingInput
    entry.pendingInput = []
    for (const chunk of pending) {
      this.#options.socket.sendInput(entry.sid, chunk)
    }
  }

  #buffer(entry: PaneEntry, bytes: string | Uint8Array): void {
    const size = typeof bytes === 'string' ? bytes.length : bytes.byteLength
    entry.buffered.push(bytes)
    entry.bufferedBytes += size
    while (entry.bufferedBytes > MAX_BUFFERED_BYTES && entry.buffered.length > 1) {
      const dropped = entry.buffered.shift()
      if (dropped === undefined) {
        break
      }
      entry.bufferedBytes -= typeof dropped === 'string' ? dropped.length : dropped.byteLength
    }
  }

  #flushBuffered(entry: PaneEntry): void {
    const terminal = entry.terminal
    if (terminal === null || entry.buffered.length === 0) {
      return
    }
    const pending = entry.buffered
    entry.buffered = []
    entry.bufferedBytes = 0
    for (const chunk of pending) {
      terminal.write(chunk)
    }
  }

  #scheduleFit(entry: PaneEntry): void {
    entry.cancelResize?.()
    entry.cancelResize = this.#schedule(() => {
      entry.cancelResize = null
      this.#fit(entry)
    }, this.#resizeDebounceMs)
  }

  /** Every resize is a round trip, so only a real change in cells is sent. */
  #fit(entry: PaneEntry): void {
    const size = entry.terminal?.fit() ?? null
    if (size === null) {
      return
    }
    if (entry.lastSize?.cols === size.cols && entry.lastSize.rows === size.rows) {
      return
    }
    entry.lastSize = size
    this.#options.socket.sendResize(entry.sid, size.cols, size.rows)
  }

  #teardownTerminal(entry: PaneEntry): void {
    entry.cancelResize?.()
    entry.cancelResize = null
    entry.resize?.dispose()
    entry.resize = null
    entry.input?.dispose()
    entry.input = null
    entry.terminal?.dispose()
    entry.terminal = null
    entry.lastSize = null
  }

  #release(sid: string): void {
    const entry = this.#panes.get(sid)
    if (entry === undefined) {
      return
    }
    entry.released = true
    this.#panes.delete(sid)
    this.#teardownTerminal(entry)
    entry.buffered = []
    entry.bufferedBytes = 0
    entry.pendingInput = []
    this.#options.socket.unsubscribe(sid)
  }

  #enqueue(entry: PaneEntry, operation: () => Promise<void>): void {
    entry.pending += 1
    entry.queue = entry.queue
      .then(async () => {
        if (entry.released || this.#disposed) {
          return
        }
        await operation()
      })
      .catch((error: unknown) => {
        this.#options.onError?.(error)
      })
      .then(() => {
        entry.pending -= 1
        if (entry.pending === 0 && !entry.released) {
          this.#flushBuffered(entry)
        }
      })
  }

  #observeResize(element: HTMLElement, onResize: () => void): PaneDisposable {
    if (this.#options.observeResize !== undefined) {
      return this.#options.observeResize(element, onResize)
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(element)
    return {
      dispose: () => {
        observer.disconnect()
      },
    }
  }

  #schedule(handler: () => void, delayMs: number): () => void {
    if (this.#options.schedule !== undefined) {
      return this.#options.schedule(handler, delayMs)
    }
    const handle = globalThis.setTimeout(handler, delayMs)
    return () => {
      globalThis.clearTimeout(handle)
    }
  }
}

export function applyControlModifier(data: string): string {
  // A paste may arrive as one multi-character chunk. Never turn its leading
  // letter into a control signal while silently sending the remainder.
  if (data.length !== 1) {
    return data
  }
  const code = data.charCodeAt(0)
  const normalized = code >= 97 && code <= 122 ? code - 32 : code
  if (normalized < 64 || normalized > 95) {
    return data
  }
  return String.fromCharCode(normalized & 0x1f) + data.slice(1)
}

import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import type { VisibilityLevel } from '@termspace/contracts'

import {
  PaneStore,
  type PaneDisposable,
  type PaneSize,
  type PaneTerminal,
  type RendererKind,
} from './pane-store.ts'

const SID_A = 'ses_aaaaaaaa0001'
const SID_B = 'ses_bbbbbbbb0002'

/** A stand-in for one `xterm.js` terminal that records what was done to it. */
class FakeTerminal implements PaneTerminal {
  static instances: FakeTerminal[] = []

  readonly writes: (string | Uint8Array)[] = []
  readonly renderers: RendererKind[] = []
  opened: HTMLElement | null = null
  resets = 0
  disposed = false
  inputHandler: ((data: string) => void) | null = null
  inputDisposed = false
  size: PaneSize | null = { cols: 80, rows: 24 }

  constructor() {
    FakeTerminal.instances.push(this)
  }

  get text(): string {
    return this.writes.map((chunk) => (typeof chunk === 'string' ? chunk : decode(chunk))).join('')
  }

  write(data: string | Uint8Array): void {
    this.writes.push(data)
  }

  async flush(): Promise<void> {
    await Promise.resolve()
  }

  reset(): void {
    this.resets += 1
    this.writes.length = 0
  }

  open(container: HTMLElement): void {
    this.opened = container
  }

  setRenderer(kind: RendererKind): void {
    this.renderers.push(kind)
  }

  serialize(): string {
    return this.text
  }

  fit(): PaneSize | null {
    return this.size
  }

  onData(handler: (data: string) => void): PaneDisposable {
    this.inputHandler = handler
    return {
      dispose: () => {
        this.inputHandler = null
        this.inputDisposed = true
      },
    }
  }

  dispose(): void {
    this.disposed = true
  }
}

class FakeSocket {
  readonly calls: string[] = []
  readonly input: string[] = []
  readonly resizes: { sid: string; cols: number; rows: number }[] = []

  subscribe(sid: string, level?: VisibilityLevel): void {
    this.calls.push(`sub:${sid}:${level ?? 'visible'}`)
  }

  unsubscribe(sid: string): void {
    this.calls.push(`unsub:${sid}`)
  }

  sendInput(sid: string, data: string): void {
    this.input.push(`${sid}:${data}`)
  }

  sendResize(sid: string, cols: number, rows: number): void {
    this.resizes.push({ sid, cols, rows })
  }

  sendVisibility(sid: string, level: VisibilityLevel): void {
    this.calls.push(`vis:${sid}:${level}`)
  }
}

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** Enough of an element for the store; it only ever passes it straight through. */
function container(name: string): HTMLElement {
  return { name } as unknown as HTMLElement
}

/** The store's work is queued on promises, so a few microtask turns settle it. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1) {
    await Promise.resolve()
  }
}

describe('PaneStore', () => {
  let socket: FakeSocket
  let resizeHandlers: Map<HTMLElement, () => void>
  let scheduled: (() => void)[]
  let store: PaneStore

  beforeEach(() => {
    FakeTerminal.instances = []
    socket = new FakeSocket()
    resizeHandlers = new Map()
    scheduled = []
    store = new PaneStore({
      createTerminal: () => Promise.resolve(new FakeTerminal()),
      socket,
      observeResize: (element, onResize) => {
        resizeHandlers.set(element, onResize)
        return {
          dispose: () => {
            resizeHandlers.delete(element)
          },
        }
      },
      schedule: (handler) => {
        scheduled.push(handler)
        return () => {
          scheduled = scheduled.filter((entry) => entry !== handler)
        }
      },
      onError: (error) => {
        assert.fail(`unexpected store error: ${String(error)}`)
      },
    })
  })

  it('subscribes a new pane and opens it only when it has somewhere to render', async () => {
    const element = container('a')
    store.sync([
      { sid: SID_A, visibility: 'focused', container: element },
      { sid: SID_B, visibility: 'hidden', container: null },
    ])
    await settle()

    const [visible, headless] = FakeTerminal.instances
    assert.equal(visible?.opened, element)
    assert.equal(headless?.opened, null, 'a hidden pane must never be opened')
    assert.deepEqual(socket.calls, [`sub:${SID_A}:focused`, `sub:${SID_B}:hidden`])
  })

  it('gives WebGL to the focused pane and the plain renderer to every other one', async () => {
    const focused = container('a')
    const beside = container('b')
    store.sync([
      { sid: SID_A, visibility: 'focused', container: focused },
      { sid: SID_B, visibility: 'visible', container: beside },
    ])
    await settle()

    const [a, b] = FakeTerminal.instances
    assert.deepEqual(a?.renderers, ['webgl'])
    assert.deepEqual(b?.renderers, ['dom'])

    // Focus moves: the old pane must give its context up before the new one takes one.
    store.sync([
      { sid: SID_A, visibility: 'visible', container: focused },
      { sid: SID_B, visibility: 'focused', container: beside },
    ])
    await settle()
    assert.deepEqual(a?.renderers, ['webgl', 'dom'])
    assert.deepEqual(b?.renderers, ['dom', 'webgl'])
    assert.deepEqual(socket.calls.slice(-2), [`vis:${SID_A}:visible`, `vis:${SID_B}:focused`])
  })

  it('wires input only after a restore has been applied', async () => {
    const element = container('a')
    store.sync([{ sid: SID_A, visibility: 'focused', container: element }])
    await settle()

    const terminal = FakeTerminal.instances[0]
    // Compared as a boolean: asserting the field itself narrows its type to
    // `null` for the rest of the test.
    assert.equal(terminal?.inputHandler === null, true, 'input is not wired before restore')

    store.restore(SID_A, 'screen so far$ ')
    await settle()
    assert.equal(terminal?.resets, 1)
    assert.equal(terminal.text, 'screen so far$ ')
    terminal.inputHandler?.('ls\r')
    assert.deepEqual(socket.input, [`${SID_A}:ls\r`])
  })

  it('keeps a hidden pane current, then shows it without asking the server again', async () => {
    store.sync([{ sid: SID_A, visibility: 'hidden', container: null }])
    await settle()
    store.restore(SID_A, 'before$ ')
    await settle()
    store.write(SID_A, bytes('while hidden\r\n'))

    const headless = FakeTerminal.instances[0]
    assert.equal(headless?.opened, null)
    assert.equal(headless?.text, 'before$ while hidden\r\n')

    const element = container('a')
    store.sync([{ sid: SID_A, visibility: 'focused', container: element }])
    await settle()

    assert.equal(FakeTerminal.instances.length, 2)
    const shown = FakeTerminal.instances[1]
    assert.equal(shown?.opened, element)
    assert.equal(shown?.text, 'before$ while hidden\r\n', 'the screen carried over intact')
    assert.equal(headless?.disposed, true, 'the headless terminal is disposed, not leaked')
    assert.equal(
      socket.calls.filter((call) => call.startsWith('sub:')).length,
      1,
      'showing a pane must not resubscribe it',
    )
    // Input was live before the switch, so it comes back with the new terminal.
    shown?.inputHandler?.('x')
    assert.deepEqual(socket.input, [`${SID_A}:x`])
  })

  it('hides a visible pane back into a headless terminal that keeps receiving output', async () => {
    const element = container('a')
    store.sync([{ sid: SID_A, visibility: 'focused', container: element }])
    await settle()
    store.restore(SID_A, 'on screen$ ')
    await settle()

    store.sync([{ sid: SID_A, visibility: 'hidden', container: null }])
    await settle()

    const hidden = FakeTerminal.instances[1]
    assert.equal(hidden?.opened, null, 'the pane went back to headless')
    assert.equal(hidden?.text, 'on screen$ ')
    store.write(SID_A, bytes('still coming\r\n'))
    await settle()
    assert.equal(hidden?.text, 'on screen$ still coming\r\n')
    assert.equal(FakeTerminal.instances[0]?.disposed, true)
  })

  it('holds output that arrives mid-rehost and replays it in order', async () => {
    store.sync([{ sid: SID_A, visibility: 'hidden', container: null }])
    await settle()
    store.restore(SID_A, 'a')
    await settle()

    store.sync([{ sid: SID_A, visibility: 'focused', container: container('a') }])
    store.write(SID_A, bytes('b'))
    store.write(SID_A, bytes('c'))
    await settle()

    assert.equal(FakeTerminal.instances[1]?.text, 'abc')
  })

  it('debounces resize and only sends a size that actually changed', async () => {
    const element = container('a')
    store.sync([{ sid: SID_A, visibility: 'focused', container: element }])
    await settle()
    assert.deepEqual(socket.resizes, [{ sid: SID_A, cols: 80, rows: 24 }])

    const terminal = FakeTerminal.instances[0]
    resizeHandlers.get(element)?.()
    resizeHandlers.get(element)?.()
    assert.equal(socket.resizes.length, 1, 'nothing is sent until the debounce fires')
    for (const handler of scheduled.splice(0)) {
      handler()
    }
    assert.equal(socket.resizes.length, 1, 'the same size is not resent')

    if (terminal !== undefined) {
      terminal.size = { cols: 120, rows: 40 }
    }
    resizeHandlers.get(element)?.()
    for (const handler of scheduled.splice(0)) {
      handler()
    }
    assert.deepEqual(socket.resizes.at(-1), { sid: SID_A, cols: 120, rows: 40 })
  })

  it('releases a pane that leaves the layout, disposing everything it held', async () => {
    const element = container('a')
    store.sync([{ sid: SID_A, visibility: 'focused', container: element }])
    await settle()
    store.restore(SID_A, 'x')
    await settle()

    store.sync([])
    await settle()

    const terminal = FakeTerminal.instances[0]
    assert.equal(terminal?.disposed, true)
    assert.equal(terminal?.inputDisposed, true)
    assert.equal(resizeHandlers.size, 0, 'the resize observer is disconnected')
    assert.deepEqual(socket.calls.at(-1), `unsub:${SID_A}`)
    assert.deepEqual(store.sessionIds, [])

    // Output for a released pane is dropped rather than resurrecting it.
    store.write(SID_A, bytes('late'))
    assert.equal(FakeTerminal.instances.length, 1)
  })

  it('disposes every pane and cancels pending resizes on teardown', async () => {
    store.sync([
      { sid: SID_A, visibility: 'focused', container: container('a') },
      { sid: SID_B, visibility: 'hidden', container: null },
    ])
    await settle()

    store.dispose()
    await settle()

    for (const terminal of FakeTerminal.instances) {
      assert.equal(terminal.disposed, true)
    }
    assert.equal(resizeHandlers.size, 0)
    assert.deepEqual(store.sessionIds, [])
    store.sync([{ sid: SID_A, visibility: 'focused', container: container('a') }])
    await settle()
    assert.equal(FakeTerminal.instances.length, 2, 'a disposed store stays disposed')
  })

  it('applies a fresh restore after a reconnect without duplicating the input handler', async () => {
    const element = container('a')
    store.sync([{ sid: SID_A, visibility: 'focused', container: element }])
    await settle()
    store.restore(SID_A, 'first')
    await settle()
    store.restore(SID_A, 'second')
    await settle()

    const terminal = FakeTerminal.instances[0]
    assert.equal(terminal?.resets, 2)
    assert.equal(terminal?.text, 'second')
    terminal?.inputHandler?.('k')
    assert.deepEqual(socket.input, [`${SID_A}:k`], 'one handler, one send')
  })
})

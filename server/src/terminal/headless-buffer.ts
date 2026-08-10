import serializePackage from '@xterm/addon-serialize'
import headlessPackage, { type Terminal as HeadlessTerminal } from '@xterm/headless'

const { SerializeAddon } = serializePackage
const { Terminal } = headlessPackage

class HeadlessTerminalBuffer {
  readonly #serializeAddon = new SerializeAddon()
  readonly #terminal: HeadlessTerminal
  #writeQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.#terminal = new Terminal({
      allowProposedApi: true,
      cols: 200,
      rows: 50,
      scrollback: 2_000,
    })
    this.#terminal.loadAddon(this.#serializeAddon)
  }

  write(data: string): Promise<void> {
    this.#writeQueue = this.#writeQueue.then(
      () =>
        new Promise<void>((resolve) => {
          this.#terminal.write(data, resolve)
        }),
    )
    return this.#writeQueue
  }

  async serialize(): Promise<string> {
    await this.#writeQueue
    return this.#serializeAddon.serialize({ scrollback: 2_000 })
  }

  dispose(): void {
    this.#terminal.dispose()
  }
}

interface BufferEntry {
  readonly buffer: HeadlessTerminalBuffer
  readonly initialized: Promise<void>
}

export class HeadlessBufferRegistry {
  readonly #buffers = new Map<string, BufferEntry>()

  async restore(
    sessionId: string,
    capture: () => Promise<string>,
  ): Promise<string> {
    let entry = this.#buffers.get(sessionId)
    if (entry === undefined) {
      const buffer = new HeadlessTerminalBuffer()
      const initialized = capture().then((data) => buffer.write(data))
      entry = { buffer, initialized }
      this.#buffers.set(sessionId, entry)
      initialized.catch(() => {
        if (this.#buffers.get(sessionId) === entry) {
          this.#buffers.delete(sessionId)
          buffer.dispose()
        }
      })
    }
    await entry.initialized
    return entry.buffer.serialize()
  }

  async write(sessionId: string, data: string): Promise<void> {
    const entry = this.#buffers.get(sessionId)
    if (entry === undefined) {
      const buffer = new HeadlessTerminalBuffer()
      const initialized = Promise.resolve()
      this.#buffers.set(sessionId, { buffer, initialized })
      await buffer.write(data)
      return
    }
    await entry.initialized
    await entry.buffer.write(data)
  }

  dispose(): void {
    for (const { buffer } of this.#buffers.values()) {
      buffer.dispose()
    }
    this.#buffers.clear()
  }
}

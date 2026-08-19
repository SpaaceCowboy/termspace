import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { IDisposable, IPty } from 'node-pty'

import type { PtySpawner, TmuxAttacher } from './viewer-attachment.js'
import { ViewerAttachmentFactory } from './viewer-attachment.js'

const SID = 'ses_portalui0001'

class FakePty implements IPty {
  readonly cols = 200
  readonly handleFlowControl = false
  readonly pid = 123
  readonly process = 'tmux'
  readonly rows = 50
  readonly writes: string[] = []
  readonly resizes: { cols: number; rows: number }[] = []
  killed = false
  #dataListener: ((data: string) => void) | undefined
  #exitListener: ((event: { exitCode: number; signal?: number }) => void) | undefined

  readonly onData = (listener: (data: string) => void): IDisposable => {
    this.#dataListener = listener
    return { dispose: () => (this.#dataListener = undefined) }
  }

  readonly onExit = (
    listener: (event: { exitCode: number; signal?: number }) => void,
  ): IDisposable => {
    this.#exitListener = listener
    return { dispose: () => (this.#exitListener = undefined) }
  }

  clear(): void {}
  pause(): void {}
  resume(): void {}

  kill(): void {
    this.killed = true
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows })
  }

  write(data: string | Buffer): void {
    this.writes.push(data.toString())
  }

  emitData(data: string): void {
    this.#dataListener?.(data)
  }

  emitExit(exitCode: number): void {
    this.#exitListener?.({ exitCode })
  }
}

class FakeSpawner implements PtySpawner {
  readonly ptys: FakePty[] = []
  readonly calls: { command: string; arguments_: string[] }[] = []

  spawn(command: string, arguments_: string[]): IPty {
    this.calls.push({ command, arguments_ })
    const pty = new FakePty()
    this.ptys.push(pty)
    return pty
  }
}

const tmux: TmuxAttacher = {
  attachCommand: (sessionId) => ({
    command: 'tmux',
    arguments_: ['-S', '/run/termspace/tmux.sock', 'attach-session', '-t', `ts_${String(sessionId)}`],
  }),
}

describe('ViewerAttachmentFactory', () => {
  it('spawns one independent tmux attachment per viewer', () => {
    const spawner = new FakeSpawner()
    const factory = new ViewerAttachmentFactory(spawner, tmux)

    factory.attach(SID, { onData: () => {}, onExit: () => {} })
    factory.attach(SID, { onData: () => {}, onExit: () => {} })

    assert.equal(spawner.ptys.length, 2)
    assert.deepEqual(spawner.calls, [
      {
        command: 'tmux',
        arguments_: [
          '-S',
          '/run/termspace/tmux.sock',
          'attach-session',
          '-t',
          `ts_${SID}`,
        ],
      },
      {
        command: 'tmux',
        arguments_: [
          '-S',
          '/run/termspace/tmux.sock',
          'attach-session',
          '-t',
          `ts_${SID}`,
        ],
      },
    ])
  })

  it('forwards data, input, resize, exit, and viewer-only close', () => {
    const spawner = new FakeSpawner()
    const factory = new ViewerAttachmentFactory(spawner, tmux)
    const output: string[] = []
    const exits: number[] = []
    const attachment = factory.attach(SID, {
      onData: (data) => output.push(data),
      onExit: ({ exitCode }) => exits.push(exitCode),
    })
    const pty = spawner.ptys[0]
    assert.ok(pty)

    pty.emitData('ready')
    attachment.write('ls\r')
    attachment.resize(120, 40)
    pty.emitExit(0)
    attachment.close()

    assert.deepEqual(output, ['ready'])
    assert.deepEqual(exits, [0])
    assert.deepEqual(pty.writes, ['ls\r'])
    assert.deepEqual(pty.resizes, [{ cols: 120, rows: 40 }])
    assert.equal(pty.killed, true)
  })
})

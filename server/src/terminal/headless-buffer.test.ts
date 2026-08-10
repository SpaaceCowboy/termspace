import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'

import { HeadlessBufferRegistry } from './headless-buffer.js'

const SID = 'ses_portalui0001'

describe('HeadlessBufferRegistry', () => {
  let registry: HeadlessBufferRegistry | undefined

  afterEach(() => {
    registry?.dispose()
  })

  it('falls back to one capture and restores subsequent live output', async () => {
    registry = new HeadlessBufferRegistry()
    let captures = 0

    const firstRestore = await registry.restore(SID, async () => {
      captures += 1
      return '\u001b[32mready\u001b[0m\r\n$ '
    })
    await registry.write(SID, 'echo hello\r\nhello\r\n$ ')
    const secondRestore = await registry.restore(SID, async () => {
      captures += 1
      return 'must not be used'
    })

    assert.match(firstRestore, /ready/)
    assert.match(secondRestore, /echo hello/)
    assert.match(secondRestore, /hello/)
    assert.equal(captures, 1)
  })

  it('shares one capture across concurrent restore requests', async () => {
    registry = new HeadlessBufferRegistry()
    let releaseCapture: ((value: string) => void) | undefined
    let captures = 0
    const capture = async (): Promise<string> => {
      captures += 1
      return new Promise((resolve) => {
        releaseCapture = resolve
      })
    }

    const first = registry.restore(SID, capture)
    const second = registry.restore(SID, capture)
    releaseCapture?.('captured\r\n')

    assert.match(await first, /captured/)
    assert.match(await second, /captured/)
    assert.equal(captures, 1)
  })
})

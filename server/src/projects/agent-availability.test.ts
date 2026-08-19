import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { defaultAgentAvailability, isAgentCommandAvailable } from './agent-availability.js'

describe('agent availability', () => {
  it('finds executable commands in a validated PATH and rejects missing ones', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'termspace-agent-'))
    try {
      const executable = join(directory, 'present-agent')
      await writeFile(executable, '#!/bin/sh\n')
      await chmod(executable, 0o700)

      assert.equal(await isAgentCommandAvailable(['present-agent'], directory, directory), true)
      assert.equal(await isAgentCommandAvailable(['missing-agent'], directory, directory), false)
      assert.equal(await isAgentCommandAvailable(['present-agent'], directory, 42), false)
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('always exposes the built-in shell and reports command names', async () => {
    const availability = await defaultAgentAvailability('/tmp', '')
    assert.deepEqual(availability.shell, { available: true, command: null })
    assert.deepEqual(availability.claude, { available: false, command: 'claude' })
    assert.deepEqual(availability.codex, { available: false, command: 'codex' })
  })
})

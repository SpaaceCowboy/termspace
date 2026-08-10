import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readEnvironment } from './env.js'

describe('readEnvironment', () => {
  it('supplies local defaults', () => {
    assert.deepEqual(readEnvironment({}), {
      NODE_ENV: 'development',
      TERMSPACE_DATABASE_PATH: './data/termspace.db',
      TERMSPACE_HOST: '127.0.0.1',
      TERMSPACE_PORT: 3001,
    })
  })

  it('rejects an invalid port', () => {
    assert.throws(() => readEnvironment({ TERMSPACE_PORT: '70000' }))
  })
})

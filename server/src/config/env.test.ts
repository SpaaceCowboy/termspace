import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readEnvironment } from './env.js'

describe('readEnvironment', () => {
  it('supplies local defaults', () => {
    assert.deepEqual(readEnvironment({}), {
      NODE_ENV: 'development',
      TERMSPACE_ALLOWED_ORIGIN: 'http://localhost:3000',
      TERMSPACE_AUTH_SESSION_TTL_MS: 28_800_000,
      TERMSPACE_DATABASE_PATH: './data/termspace.db',
      TERMSPACE_HOST: '127.0.0.1',
      TERMSPACE_PORT: 3001,
      TERMSPACE_PROJECT_ROOT: '/srv/projects',
    })
  })

  it('rejects an invalid port', () => {
    assert.throws(() => readEnvironment({ TERMSPACE_PORT: '70000' }))
  })

  it('requires the project root to be an absolute path', () => {
    assert.throws(() => readEnvironment({ TERMSPACE_PROJECT_ROOT: 'projects' }))
    assert.throws(() => readEnvironment({ TERMSPACE_PROJECT_ROOT: '' }))
    assert.equal(
      readEnvironment({ TERMSPACE_PROJECT_ROOT: '/home/app/projects' })
        .TERMSPACE_PROJECT_ROOT,
      '/home/app/projects',
    )
  })

  it('requires an explicit allowed Origin in production', () => {
    assert.throws(() => readEnvironment({ NODE_ENV: 'production' }))
    assert.equal(
      readEnvironment({
        NODE_ENV: 'production',
        TERMSPACE_ALLOWED_ORIGIN: 'https://termspace.example',
      }).TERMSPACE_ALLOWED_ORIGIN,
      'https://termspace.example',
    )
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readEnvironment } from './env.js'

describe('readEnvironment', () => {
  it('supplies local defaults', () => {
    assert.deepEqual(readEnvironment({}), {
      NODE_ENV: 'development',
      TERMSPACE_ALLOWED_ORIGIN: 'http://localhost:3002',
      TERMSPACE_AUTH_SESSION_TTL_MS: 28_800_000,
      TERMSPACE_DATABASE_PATH: './data/termspace.db',
      TERMSPACE_HOST: '127.0.0.1',
      TERMSPACE_IDLE_SESSION_GRACE_MS: 86_400_000,
      TERMSPACE_PORT: 3001,
      TERMSPACE_PROJECT_ROOT: '/srv/projects',
      TERMSPACE_SESSION_MEMORY_MAX_BYTES: 4_294_967_296,
      TERMSPACE_SESSION_SHELL: '/bin/bash',
      TERMSPACE_SYSTEMD_SESSION_SCOPES: false,
      TERMSPACE_TMUX_SOCKET_NAME: 'default',
    })
  })

  /**
   * The two defaults have to agree or every WebSocket upgrade is rejected with
   * a bare 403: `web` serves on 3002 unless `PORT` says otherwise.
   */
  it('defaults the allowed Origin to the port the web package serves on', () => {
    assert.equal(readEnvironment({}).TERMSPACE_ALLOWED_ORIGIN, 'http://localhost:3002')
  })

  it('rejects an invalid port', () => {
    assert.throws(() => readEnvironment({ TERMSPACE_PORT: '70000' }))
  })

  it('bounds the idle-session grace period', () => {
    assert.equal(
      readEnvironment({ TERMSPACE_IDLE_SESSION_GRACE_MS: '3600000' })
        .TERMSPACE_IDLE_SESSION_GRACE_MS,
      3_600_000,
    )
    assert.throws(() => readEnvironment({ TERMSPACE_IDLE_SESSION_GRACE_MS: '59999' }))
    assert.throws(() => readEnvironment({ TERMSPACE_IDLE_SESSION_GRACE_MS: '2592000001' }))
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

  it('validates systemd session scope settings at the environment boundary', () => {
    assert.deepEqual(
      readEnvironment({
        TERMSPACE_SYSTEMD_SESSION_SCOPES: 'true',
        TERMSPACE_SESSION_MEMORY_MAX_BYTES: '536870912',
        TERMSPACE_SESSION_SHELL: '/bin/zsh',
        TERMSPACE_TMUX_SOCKET_NAME: 'termspace-test',
        TERMSPACE_TMUX_SOCKET_PATH: '/run/user/1000/termspace/tmux.sock',
      }),
      {
        ...readEnvironment({}),
        TERMSPACE_SYSTEMD_SESSION_SCOPES: true,
        TERMSPACE_SESSION_MEMORY_MAX_BYTES: 536_870_912,
        TERMSPACE_SESSION_SHELL: '/bin/zsh',
        TERMSPACE_TMUX_SOCKET_NAME: 'termspace-test',
        TERMSPACE_TMUX_SOCKET_PATH: '/run/user/1000/termspace/tmux.sock',
      },
    )
    assert.throws(() => readEnvironment({ TERMSPACE_SYSTEMD_SESSION_SCOPES: 'yes' }))
    assert.throws(() => readEnvironment({ TERMSPACE_SESSION_MEMORY_MAX_BYTES: '1024' }))
    assert.throws(() => readEnvironment({ TERMSPACE_SESSION_SHELL: 'bash' }))
    assert.throws(() => readEnvironment({ TERMSPACE_TMUX_SOCKET_NAME: '../escape' }))
    assert.throws(() => readEnvironment({ TERMSPACE_TMUX_SOCKET_PATH: 'tmux.sock' }))
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

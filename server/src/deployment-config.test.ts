import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const repositoryRoot = new URL('../../', import.meta.url)

describe('production listener boundaries', () => {
  it('binds the Next.js systemd service to loopback', async () => {
    const unit = await readFile(
      new URL('deploy/systemd/termspace-web.service', repositoryRoot),
      'utf8',
    )

    assert.match(
      unit,
      /^ExecStart=.*next start --hostname 127\.0\.0\.1$/m,
    )
  })

  it('keeps the package start command loopback-only by default', async () => {
    const manifest = JSON.parse(await readFile(
      new URL('web/package.json', repositoryRoot),
      'utf8',
    )) as { scripts?: { start?: string } }

    assert.equal(
      manifest.scripts?.start,
      'next start --hostname ${HOSTNAME:-127.0.0.1} --port ${PORT:-3002}',
    )
  })

  it('keeps tmux session timers attached without enabling practical auto-locking', async () => {
    const config = await readFile(
      new URL('server/tmux.conf', repositoryRoot),
      'utf8',
    )

    assert.match(config, /^set-option -g lock-after-time 2147483647$/m)
  })
})

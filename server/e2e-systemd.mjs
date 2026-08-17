import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'
import { TmuxClient } from './dist/tmux/tmux-client.js'

const SID = 'ses_systemde2e01'
const SOCKET = 'termspace-systemd-e2e'
const TMUX_UNIT = 'termspace-tmux-e2e.service'
const GATEWAY_UNIT = 'termspace-gateway-e2e.service'
const MEMORY_MAX = 256 * 1_024 * 1_024
const root = await mkdtemp(join(tmpdir(), 'termspace-systemd-'))
const projectRoot = join(root, 'projects')
const databasePath = join(root, 'termspace.db')
const repositoryRoot = resolve(new URL('..', import.meta.url).pathname)
const serverRoot = join(repositoryRoot, 'server')
const configPath = join(serverRoot, 'tmux.conf')
const nodePath = process.execPath
const processes = new ExecFileProcessRunner()
const port = await availablePort()
const tmux = new TmuxClient(processes, {
  configPath,
  socketName: SOCKET,
  sessionScope: {
    memoryMaxBytes: MEMORY_MAX,
    shell: '/bin/bash',
    user: true,
  },
})

try {
  await mkdir(projectRoot)
  await systemdRun([
    `--unit=${TMUX_UNIT}`,
    '--property=Type=exec',
    '--collect',
    '/usr/bin/tmux', '-L', SOCKET, '-D', '-f', configPath,
  ])
  await systemdRun([
    `--unit=${GATEWAY_UNIT}`,
    '--property=Type=exec',
    '--collect',
    `--working-directory=${serverRoot}`,
    '--setenv=NODE_ENV=test',
    `--setenv=TERMSPACE_DATABASE_PATH=${databasePath}`,
    `--setenv=TERMSPACE_PROJECT_ROOT=${projectRoot}`,
    `--setenv=TERMSPACE_ALLOWED_ORIGIN=http://localhost:${String(port)}`,
    `--setenv=TERMSPACE_PORT=${String(port)}`,
    `--setenv=TERMSPACE_TMUX_SOCKET_NAME=${SOCKET}`,
    '--setenv=TERMSPACE_SYSTEMD_SESSION_SCOPES=false',
    nodePath, 'dist/index.js',
  ])
  await waitForHealth(port)

  await tmux.createDetached(SID, projectRoot, ['/usr/bin/tail', '-f', '/dev/null'])
  assert.ok((await tmux.listSessionIds()).has(SID))

  const scopeUnit = `termspace-session-${SID}.scope`
  await waitForUnitActive(scopeUnit)
  const [tmuxCgroup, gatewayCgroup, sessionCgroup, memoryMax] = await Promise.all([
    show(TMUX_UNIT, 'ControlGroup'),
    show(GATEWAY_UNIT, 'ControlGroup'),
    show(scopeUnit, 'ControlGroup'),
    show(scopeUnit, 'MemoryMax'),
  ])
  assert.notEqual(tmuxCgroup, gatewayCgroup)
  assert.notEqual(sessionCgroup, tmuxCgroup)
  assert.notEqual(sessionCgroup, gatewayCgroup)
  assert.match(sessionCgroup, /termspace-sessions\.slice/)
  assert.equal(Number(memoryMax), MEMORY_MAX)

  await systemctl(['restart', GATEWAY_UNIT])
  await waitForHealth(port)
  assert.ok((await tmux.listSessionIds()).has(SID), 'gateway restart killed tmux session')
  assert.equal(await show(scopeUnit, 'ActiveState'), 'active')

  await tmux.kill(SID)
  assert.equal((await tmux.listSessionIds()).has(SID), false)
  assert.equal(await show(scopeUnit, 'ActiveState'), 'inactive')

  console.log('9/9 systemd ownership checks passed against real systemd, tmux, and gateway')
} finally {
  await tmux.kill(SID).catch(() => undefined)
  await systemctl(['stop', GATEWAY_UNIT]).catch(() => undefined)
  await systemctl(['stop', TMUX_UNIT]).catch(() => undefined)
  await rm(root, { recursive: true, force: true })
}

async function systemdRun(arguments_) {
  return processes.run('systemd-run', ['--user', ...arguments_])
}

async function systemctl(arguments_) {
  return processes.run('systemctl', ['--user', ...arguments_])
}

async function show(unit, property) {
  const result = await systemctl(['show', unit, `--property=${property}`, '--value'])
  return result.stdout.trim()
}

async function waitForHealth(targetPort) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(targetPort)}/api/health`)
      if (response.ok) return
    } catch {
      // The Type=exec unit exists before Fastify has bound its socket.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  throw new Error('Gateway did not become healthy')
}

async function waitForUnitActive(unit) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (await show(unit, 'ActiveState') === 'active') return
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
  const pane = await tmux.capture(SID).catch((error) => String(error))
  throw new Error(`Session scope did not become active. Pane output: ${pane}`)
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No TCP port assigned')
  await new Promise((resolveClose, reject) => {
    server.close((error) => error === undefined ? resolveClose() : reject(error))
  })
  return address.port
}

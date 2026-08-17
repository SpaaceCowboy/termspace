import assert from 'node:assert/strict'
import { access, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'

import { ExecFileProcessRunner } from './dist/tmux/process-runner.js'
import { TmuxClient } from './dist/tmux/tmux-client.js'

const SID = 'ses_systemde2e01'
const TMUX_UNIT = 'termspace-tmux-e2e.service'
const GATEWAY_UNIT = 'termspace-gateway-e2e.service'
const MEMORY_MAX = 256 * 1_024 * 1_024
const repositoryRoot = resolve(new URL('..', import.meta.url).pathname)
const root = await mkdtemp(join(repositoryRoot, '.termspace-systemd-'))
const projectRoot = join(root, 'projects')
const blockedRoot = join(root, 'blocked')
const databasePath = join(root, 'termspace.db')
const serverRoot = join(repositoryRoot, 'server')
const configPath = join(serverRoot, 'tmux.conf')
const runtimeDirectory = 'termspace-systemd-e2e'
const runtimeRoot = process.env.XDG_RUNTIME_DIR ?? `/run/user/${String(process.getuid())}`
const socketPath = join(runtimeRoot, runtimeDirectory, 'tmux.sock')
const privateTmpMarker = `/tmp/termspace-private-${String(process.pid)}`
const nodePath = process.execPath
const processes = new ExecFileProcessRunner()
const port = await availablePort()
const tmux = new TmuxClient(processes, {
  configPath,
  socketPath,
  sessionScope: {
    memoryMaxBytes: MEMORY_MAX,
    shell: '/bin/bash',
    user: true,
  },
})

try {
  await mkdir(projectRoot)
  await mkdir(blockedRoot)
  await systemdRun([
    `--unit=${TMUX_UNIT}`,
    '--property=Type=exec',
    `--property=RuntimeDirectory=${runtimeDirectory}`,
    '--property=RuntimeDirectoryMode=0700',
    '--property=ProtectSystem=strict',
    '--property=ProtectHome=read-only',
    '--property=PrivateTmp=yes',
    `--property=ReadWritePaths=${projectRoot}`,
    '--collect',
    '/usr/bin/tmux', '-S', socketPath, '-D', '-f', configPath,
  ])
  await systemdRun([
    `--unit=${GATEWAY_UNIT}`,
    '--property=Type=exec',
    '--property=ProtectSystem=strict',
    '--property=ProtectHome=read-only',
    '--property=PrivateTmp=yes',
    `--property=ReadWritePaths=${root}`,
    '--collect',
    `--working-directory=${serverRoot}`,
    '--setenv=NODE_ENV=test',
    `--setenv=TERMSPACE_DATABASE_PATH=${databasePath}`,
    `--setenv=TERMSPACE_PROJECT_ROOT=${projectRoot}`,
    `--setenv=TERMSPACE_ALLOWED_ORIGIN=http://localhost:${String(port)}`,
    `--setenv=TERMSPACE_PORT=${String(port)}`,
    `--setenv=TERMSPACE_TMUX_SOCKET_PATH=${socketPath}`,
    '--setenv=TERMSPACE_SYSTEMD_SESSION_SCOPES=false',
    nodePath, 'dist/index.js',
  ])
  await waitForHealth(port)

  const allowedPath = join(projectRoot, 'allowed.txt')
  const deniedPath = join(blockedRoot, 'denied.txt')
  await tmux.createDetached(SID, projectRoot, [
    '/bin/sh', '-c',
    'echo allowed > "$1"; ' +
      'if (echo denied > "$2") 2>/dev/null; then echo WRITE_ESCAPE; else echo blocked; fi; ' +
      'echo private > "$3"; echo ready; exec /usr/bin/tail -f /dev/null',
    'termspace-e2e', allowedPath, deniedPath, privateTmpMarker,
  ])
  assert.ok((await tmux.listSessionIds()).has(SID))
  await waitForPaneText('ready')
  await access(allowedPath)
  await assert.rejects(access(deniedPath))
  await assert.rejects(access(privateTmpMarker))

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

  console.log('12/12 systemd ownership and hardening checks passed')
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

async function waitForPaneText(expected) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const pane = await tmux.capture(SID)
    if (pane.includes(expected)) {
      assert.equal(pane.includes('WRITE_ESCAPE'), false)
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
  throw new Error(`Pane never printed ${expected}`)
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

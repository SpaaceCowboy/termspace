/**
 * Push registration and delivery, against a real gateway.
 *
 * A real push service cannot be part of this: it needs a browser to mint an
 * endpoint. What is checked here is everything up to that boundary — the
 * subscription lifecycle, and that a session entering needs-you really does
 * cause a delivery attempt against the stored endpoint.
 */
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { createECDH, randomBytes } from 'node:crypto'

const BASE = process.env.BASE ?? 'http://localhost:3011'
let cookie = ''
const checks = []
function check(name, passed, detail = '') {
  checks.push(passed)
  process.stdout.write(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail === '' ? '' : ` — ${detail}`}\n`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(100)
  }
  return false
}

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
  })
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
  const t = await r.text()
  return { status: r.status, body: t === '' ? null : JSON.parse(t) }
}

// Stands in for a push service. Records that a delivery was attempted; the
// payload is encrypted, so its content is deliberately not inspected.
const received = []
// HTTPS, because web-push speaks TLS to an endpoint whatever its scheme says.
// The gateway under test runs with NODE_TLS_REJECT_UNAUTHORIZED=0 so this
// self-signed certificate is accepted; that is a property of this test only.
const pushService = createServer(
  {
    key: readFileSync(process.env.PUSH_TLS_KEY),
    cert: readFileSync(process.env.PUSH_TLS_CERT),
  },
  (req, res) => {
    received.push(req.url)
    res.writeHead(201).end()
  },
)
await new Promise((resolve) => pushService.listen(0, '127.0.0.1', resolve))
const pushPort = pushService.address().port

const { generate } = await import('otplib')
const { default: WebSocket } = await import('ws')
const db = new DatabaseSync(process.env.DB, { readOnly: true })
const secret = db.prepare('select totp_secret from users where username=?').get('operator').totp_secret
db.close()

await api('/api/auth/login', { method: 'POST', body: JSON.stringify({
  username: 'operator', password: process.env.PASSWORD, totp: await generate({ secret }) }) })

const config = (await api('/api/config')).body.data
check('config advertises a push public key', typeof config.pushPublicKey === 'string' && config.pushPublicKey.length > 20)

const status = (await api('/api/push')).body.data
check('push reports enabled with no devices yet', status.enabled === true && status.subscriptionCount === 0, JSON.stringify(status))

for (const [label, payload] of [
  ['a non-URL endpoint', { endpoint: 'not-a-url', keys: { p256dh: 'a', auth: 'b' } }],
  ['a missing key', { endpoint: `https://127.0.0.1:${pushPort}/x`, keys: { p256dh: 'a' } }],
  ['no body at all', undefined],
]) {
  const r = await api('/api/push/subscriptions', { method: 'POST', body: JSON.stringify(payload ?? {}) })
  check(`subscribing refuses ${label}`, r.status === 400, `status ${r.status}`)
}

/*
 * A real P-256 key pair. web-push encrypts the payload to this key, so a
 * placeholder string fails inside the crypto and never reaches the network —
 * which is exactly what happened the first time this test was written.
 */
const ecdh = createECDH('prime256v1')
ecdh.generateKeys()
const p256dh = ecdh.getPublicKey().toString('base64url')
const authSecret = randomBytes(16).toString('base64url')

const endpoint = `https://127.0.0.1:${pushPort}/push/device-1`
const created = await api('/api/push/subscriptions', {
  method: 'POST',
  body: JSON.stringify({ endpoint, keys: { p256dh, auth: authSecret } }),
})
check('a valid subscription is stored', created.status === 201, `status ${created.status}`)
check('it is counted', (await api('/api/push')).body.data.subscriptionCount === 1)

const again = await api('/api/push/subscriptions', {
  method: 'POST',
  body: JSON.stringify({ endpoint, keys: { p256dh, auth: authSecret } }),
})
check('re-subscribing the same browser does not duplicate it',
  again.status === 201 && (await api('/api/push')).body.data.subscriptionCount === 1)

// Drive a session into needs-you and watch for a delivery attempt.
const project = (await api('/api/projects', { method: 'POST', body: JSON.stringify({
  name: 'Push', path: process.env.ROOT + '/push', createDirectory: true }) })).body.data
/*
 * The agent *kind* stays `claude`, so Claude's prompt patterns apply, but the
 * launch command is overridden to a plain shell — otherwise the real Claude TUI
 * starts and typed text lands in its input box instead of running.
 */
await api(`/api/projects/${project.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ agentCommands: { claude: ['sh'] } }),
})
const session = (await api('/api/sessions', { method: 'POST', body: JSON.stringify({
  projectId: project.id, name: 'asker', agent: 'claude' }) })).body.data

const ticket = (await api('/api/ws-ticket', { method: 'POST' })).body.data.ticket
const socket = new WebSocket(`${BASE.replace('http', 'ws')}/ws?ticket=${ticket}`, {
  origin: process.env.ORIGIN ?? 'http://localhost:3002',
  headers: { cookie },
})
const statuses = []
await new Promise((resolve, reject) => {
  socket.on('open', resolve)
  socket.on('error', reject)
  socket.on('unexpected-response', (_q, r) => reject(new Error('status ' + r.statusCode)))
})
socket.on('message', (data, isBinary) => {
  if (isBinary) return
  const frame = JSON.parse(data.toString())
  if (frame.t === 'status') statuses.push(frame.state)
})
socket.send(JSON.stringify({ t: 'sub', sid: session.id }))
await waitFor(() => statuses.at(-1) === 'idle' || statuses.at(-1) === 'needs-you')

received.length = 0
statuses.length = 0
// The agent binary may not exist here, so the question is typed directly into
// the pty. What matters is that the tracker sees a prompt shape.
socket.send(JSON.stringify({ t: 'in', sid: session.id, data: 'printf "Do you want to proceed?\\n> 1. Yes\\n"\r' }))

check(
  'the session reaches needs-you',
  await waitFor(() => statuses.includes('needs-you')),
  statuses.join(','),
)
check(
  'an encrypted delivery reaches the push endpoint',
  await waitFor(() => received.length > 0),
  `attempts: ${received.length}`,
)

const removed = await api('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
check('unsubscribing works', removed.status === 200, `status ${removed.status}`)
check('and is idempotent', (await api('/api/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) })).status === 200)
check('the device is gone', (await api('/api/push')).body.data.subscriptionCount === 0)

const anonymous = await fetch(`${BASE}/api/push`)
check('push status needs authentication', anonymous.status === 401, `status ${anonymous.status}`)

socket.close()
await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
await api(`/api/projects/${project.id}`, { method: 'DELETE' })
pushService.close()

const passed = checks.filter(Boolean).length
process.stdout.write(`\n${passed}/${checks.length} checks passed\n`)
process.exitCode = passed === checks.length ? 0 : 1

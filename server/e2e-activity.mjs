/**
 * Session state, derived from real PTY output over a real WebSocket.
 *
 * The point is the transitions: a status frame must arrive when the state
 * changes and at no other time, and a shell sitting at its prompt must never
 * reach needs-you — that is the state meant to buzz a phone.
 */
import { DatabaseSync } from 'node:sqlite'

const BASE = process.env.BASE ?? 'http://localhost:3001'
const WS = BASE.replace('http://', 'ws://')
let cookie = ''
const checks = []
function check(name, passed, detail = '') {
  checks.push(passed)
  process.stdout.write(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail === '' ? '' : ` — ${detail}`}\n`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Waits for a condition rather than for a duration. Fixed sleeps race against
 * whatever the user's shell prompt happens to repaint, which is not something
 * this test is trying to measure.
 */
async function waitFor(predicate, timeoutMs = 12_000) {
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

const { generate } = await import('otplib')
const { default: WebSocket } = await import('ws')
const db = new DatabaseSync(process.env.DB, { readOnly: true })
const secret = db.prepare('select totp_secret from users where username=?').get('operator').totp_secret
db.close()

await api('/api/auth/login', { method: 'POST', body: JSON.stringify({
  username: 'operator', password: process.env.PASSWORD, totp: await generate({ secret }) }) })

const project = (await api('/api/projects', { method: 'POST', body: JSON.stringify({
  name: 'Activity', path: process.env.ROOT + '/activity', createDirectory: true }) })).body.data
const session = (await api('/api/sessions', { method: 'POST', body: JSON.stringify({
  projectId: project.id, name: 'act', agent: 'shell' }) })).body.data

const ticket = (await api('/api/ws-ticket', { method: 'POST' })).body.data.ticket
const statuses = []
const socket = new WebSocket(`${WS}/ws?ticket=${ticket}`, {
  origin: process.env.ORIGIN ?? 'http://localhost:3002',
  headers: { cookie },
})
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
await sleep(700)
check('subscribing announces the current state', statuses.length >= 1, statuses.join(','))

// Attaching makes the shell print its prompt, so it is already working. Let it
// settle before testing the edge, or there is no edge to observe.
await waitFor(() => statuses.at(-1) === 'idle')
statuses.length = 0

socket.send(JSON.stringify({ t: 'in', sid: session.id, data: 'echo hello\r' }))
check(
  'output moves it to working',
  await waitFor(() => statuses.includes('working')),
  statuses.join(','),
)

check(
  'it settles to idle after the window',
  await waitFor(() => statuses.at(-1) === 'idle'),
  statuses.join(','),
)
check(
  'a shell at its prompt is never needs-you',
  !statuses.includes('needs-you'),
  statuses.join(','),
)

statuses.length = 0
socket.send(JSON.stringify({ t: 'in', sid: session.id, data: 'sleep 1; echo done\r' }))
await waitFor(() => statuses.at(-1) === 'idle')
check(
  'exactly one working and one idle, not a frame per chunk of output',
  JSON.stringify(statuses) === JSON.stringify(['working', 'idle']),
  statuses.join(','),
)

statuses.length = 0
await sleep(2500)
check('a quiet session emits nothing at all', statuses.length === 0, statuses.join(','))

const persisted = (await api('/api/sessions')).body.data.find((s) => s.id === session.id)
check('the derived state is persisted', persisted.state === 'idle', String(persisted.state))

socket.close()
await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
await api(`/api/projects/${project.id}`, { method: 'DELETE' })

const passed = checks.filter(Boolean).length
process.stdout.write(`\n${passed}/${checks.length} checks passed\n`)
process.exitCode = passed === checks.length ? 0 : 1

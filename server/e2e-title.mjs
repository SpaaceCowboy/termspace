/**
 * Auto-title, against a real gateway, a real tmux and a real database.
 *
 * The unit tests prove the derivation and the timing. What they cannot prove is
 * the premise the whole feature rests on: that `tmux display-message -p
 * '#{pane_title}'` really reports what the program in the pane set with OSC 2,
 * out-of-band, with nobody attached. If that is wrong, every test above it is
 * testing a fiction.
 *
 * Run it the same way as e2e-activity.mjs:
 *   DB=./data/termspace.db PASSWORD=... ROOT=/tmp/ts-projects \
 *   ORIGIN=http://localhost:3002 node e2e-title.mjs
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
  name: 'Title', path: process.env.ROOT + '/title', createDirectory: true }) })).body.data
const session = (await api('/api/sessions', { method: 'POST', body: JSON.stringify({
  projectId: project.id, name: 'titled', agent: 'shell' }) })).body.data

async function connect() {
  const ticket = (await api('/api/ws-ticket', { method: 'POST' })).body.data.ticket
  const socket = new WebSocket(`${WS}/ws?ticket=${ticket}`, {
    origin: process.env.ORIGIN ?? 'http://localhost:3002',
    headers: { cookie },
  })
  await new Promise((resolve, reject) => {
    socket.on('open', resolve)
    socket.on('error', reject)
    socket.on('unexpected-response', (_q, r) => reject(new Error('status ' + r.statusCode)))
  })
  return socket
}

const titles = []
const statuses = []
const socket = await connect()
socket.on('message', (data, isBinary) => {
  if (isBinary) return
  const frame = JSON.parse(data.toString())
  if (frame.t === 'title') titles.push(frame.title)
  if (frame.t === 'status') statuses.push(frame.state)
})

socket.send(JSON.stringify({ t: 'sub', sid: session.id }))
await waitFor(() => statuses.at(-1) === 'idle')

// tmux's default pane_title is the hostname. A session that has never set one
// must produce no title at all rather than claiming to be called `Bebop`.
check('an untitled pane produces no title', titles.length === 0, titles.join(' | '))

// A shell setting OSC 2 is standing in for what the Claude TUI does on its own;
// the gateway cannot tell the difference, which is the point.
titles.length = 0
socket.send(JSON.stringify({
  t: 'in', sid: session.id, data: 'printf "\\033]2;\\u2733 Count markdown files in docs\\007"\r',
}))
check(
  'a title set with OSC 2 reaches the client, stripped of its glyph',
  await waitFor(() => titles.includes('Count markdown files in docs')),
  titles.join(' | '),
)

// The liveness glyph flips between working and at-rest for the same task. If
// that produced a frame, every turn would emit a title change saying nothing.
titles.length = 0
socket.send(JSON.stringify({
  t: 'in', sid: session.id, data: 'printf "\\033]2;\\u25d1 Count markdown files in docs\\007"\r',
}))
await waitFor(() => statuses.at(-1) === 'idle')
await sleep(1_500)
check('the same title behind a different glyph is not re-announced', titles.length === 0, titles.join(' | '))

const persisted = (await api('/api/sessions')).body.data.find((s) => s.id === session.id)
check(
  'the derived title is persisted',
  persisted.title === 'Count markdown files in docs',
  String(persisted.title),
)

// Edge-triggered frames are invisible to a client that connects between edges,
// which is every page load.
const second = await connect()
const rejoined = []
second.on('message', (data, isBinary) => {
  if (isBinary) return
  const frame = JSON.parse(data.toString())
  if (frame.t === 'title') rejoined.push(frame.title)
})
second.send(JSON.stringify({ t: 'sub', sid: session.id }))
check(
  'a client subscribing later is told the title it missed',
  await waitFor(() => rejoined.includes('Count markdown files in docs')),
  rejoined.join(' | '),
)
second.close()

titles.length = 0
socket.send(JSON.stringify({
  t: 'in', sid: session.id, data: 'printf "\\033]2;operator@' + (await import('node:os')).hostname() + ':~/x\\007"\r',
}))
await waitFor(() => statuses.at(-1) === 'idle')
await sleep(1_500)
check(
  'the user@host:path title a stock shell sets is ignored',
  titles.length === 0,
  titles.join(' | '),
)

socket.close()
await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
await api(`/api/projects/${project.id}`, { method: 'DELETE' })

const passed = checks.filter(Boolean).length
process.stdout.write(`\n${passed}/${checks.length} checks passed\n`)
process.exitCode = passed === checks.length ? 0 : 1

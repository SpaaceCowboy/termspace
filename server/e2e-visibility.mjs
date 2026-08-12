/**
 * Output coalescing tiers, against a real gateway, PTY and WebSocket.
 *
 * The unit tests prove the tier logic against a hand-driven scheduler. What
 * they cannot prove is that the tier reaches the socket: that the same output,
 * produced the same way, really does arrive in fewer frames when the pane is
 * hidden than when it is focused. That is the entire point of the feature, and
 * it is only observable from the far end of a real connection.
 *
 * Run it the same way as e2e-title.mjs:
 *   DB=./data/termspace.db PASSWORD=... ROOT=/tmp/ts-projects \
 *   ORIGIN=http://localhost:3002 node e2e-visibility.mjs
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
  name: 'Visibility', path: process.env.ROOT + '/visibility', createDirectory: true }) })).body.data
const session = (await api('/api/sessions', { method: 'POST', body: JSON.stringify({
  projectId: project.id, name: 'vis', agent: 'shell' }) })).body.data

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

let binaryFrames = 0
let bytes = 0
let payload = ''
const statuses = []
socket.on('message', (data, isBinary) => {
  if (isBinary) {
    binaryFrames += 1
    bytes += data.length - 16
    payload += data.subarray(16).toString('utf8')
    return
  }
  const frame = JSON.parse(data.toString())
  if (frame.t === 'status') statuses.push(frame.state)
})

socket.send(JSON.stringify({ t: 'sub', sid: session.id }))
await waitFor(() => statuses.at(-1) === 'idle')

/**
 * Produces output steadily for a couple of seconds rather than in one burst.
 * A burst would be coalesced into one frame at every tier and would measure
 * nothing at all.
 */
const DRIP = "for i in $(seq 1 60); do echo line $i; sleep 0.03; done\r"

async function measure(level) {
  socket.send(JSON.stringify({ t: 'vis', sid: session.id, level }))
  await sleep(300)
  binaryFrames = 0
  bytes = 0
  payload = ''
  statuses.length = 0
  socket.send(JSON.stringify({ t: 'in', sid: session.id, data: DRIP }))
  await waitFor(() => statuses.includes('working'))
  await waitFor(() => statuses.at(-1) === 'idle')
  await sleep(600)
  return {
    frames: binaryFrames,
    bytes,
    lines: (payload.match(/line \d+/gu) ?? []).length,
  }
}

/*
 * Discarded. The first command in a fresh pane also carries the command echo
 * and tmux's initial redraw, so it produces a different byte count from every
 * run after it. Comparing a warm run against that measures the warmup, not the
 * tier — which is exactly the wrong conclusion this test exists to avoid.
 */
await measure('focused')

const focused = await measure('focused')
const hidden = await measure('hidden')

check(
  'a focused pane gets its output in many small frames',
  focused.frames > 10,
  `${focused.frames} frames`,
)
check(
  'a hidden pane gets the same work in far fewer frames',
  hidden.frames * 2 < focused.frames,
  `hidden ${hidden.frames} vs focused ${focused.frames}`,
)
/*
 * Coalescing must change the packaging, never the content — a tier that drops
 * output is a corrupt terminal, which is worse than a slow one.
 *
 * Asserted on the lines rather than the byte total, because the byte total is
 * not stable enough to mean anything: measured across runs at the *same* tier
 * it ranged over 2726, 3503 and 3987 bytes. tmux decides how much cursor
 * positioning and redraw to emit based on its own timing, and that sits
 * upstream of our coalescer. The lines are what was actually written, and there
 * are exactly sixty of them however the escapes fall.
 */
check(
  'every line written arrives at both tiers',
  focused.lines === 60 && hidden.lines === 60,
  `focused ${focused.lines} lines, hidden ${hidden.lines} lines`,
)

// Becoming visible again must not leave the pane stuck at the slow tier.
const refocused = await measure('focused')
check(
  'returning to focused restores the fast tier',
  refocused.frames * 2 > focused.frames,
  `${refocused.frames} frames vs ${focused.frames} originally`,
)

socket.close()
await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
await api(`/api/projects/${project.id}`, { method: 'DELETE' })

const passed = checks.filter(Boolean).length
process.stdout.write(`\n${passed}/${checks.length} checks passed\n`)
process.exitCode = passed === checks.length ? 0 : 1

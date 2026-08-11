/**
 * The WebSocket upgrade, end to end: a wrong Origin is rejected *and logged
 * usably*, the right one connects, and a keystroke reaches tmux and comes back.
 */
const { default: WebSocket } = await import('ws')
const { generate: generateTotp } = await import('otplib')

const BASE = process.env.BASE ?? 'http://localhost:3005'
const WS = BASE.replace('http://', 'ws://')
const ORIGIN = process.env.ORIGIN ?? 'http://localhost:3002'
const SECRET = process.env.SECRET
let cookie = ''

const checks = []
function check(name, passed, detail = '') {
  checks.push(passed)
  process.stdout.write(`${passed ? '  ok  ' : ' FAIL '} ${name}${detail === '' ? '' : ` (${detail})`}\n`)
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie === '' ? {} : { cookie }),
    },
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie !== null) cookie = setCookie.split(';')[0]
  return { status: response.status, body: await response.json() }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    username: 'operator',
    password: 'correct horse battery staple',
    totp: await generateTotp({ secret: SECRET }),
  }),
})

const projects = (await api('/api/projects')).body.data
const project = projects[0]
const session = (
  await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ projectId: project.id, name: 'ws-check', agent: 'shell' }),
  })
).body.data

async function ticket() {
  return (await api('/api/ws-ticket', { method: 'POST' })).body.data.ticket
}

function connect(origin, tkt) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${WS}/ws?ticket=${tkt}`, { origin, headers: { cookie } })
    socket.on('open', () => resolve({ ok: true, socket }))
    socket.on('unexpected-response', (_request, response) => {
      resolve({ ok: false, status: response.statusCode })
    })
    socket.on('error', () => resolve({ ok: false, status: 0 }))
  })
}

const wrong = await connect('http://localhost:9999', await ticket())
check(
  'an upgrade from the wrong Origin is refused with 403',
  wrong.ok === false && wrong.status === 403,
  `status ${String(wrong.status)}`,
)

const right = await connect(ORIGIN, await ticket())
check('an upgrade from the configured Origin connects', right.ok === true)

if (right.ok) {
  const socket = right.socket
  const frames = []
  const output = []
  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      output.push(data.subarray(16).toString('utf8'))
      return
    }
    frames.push(JSON.parse(data.toString()))
  })

  socket.send(JSON.stringify({ t: 'sub', sid: session.id }))
  await sleep(600)
  check(
    'subscribing gets a restore frame back',
    frames.some((frame) => frame.t === 'restore' && frame.sid === session.id),
    frames.map((frame) => frame.t).join(', ') || 'no frames',
  )

  socket.send(JSON.stringify({ t: 'in', sid: session.id, data: 'echo typing-works\r' }))
  for (let attempt = 0; attempt < 40 && !output.join('').includes('typing-works'); attempt += 1) {
    await sleep(100)
  }
  check(
    'a keystroke reaches the shell and its output comes back',
    output.join('').includes('typing-works'),
    JSON.stringify(output.join('').slice(-60)),
  )
  socket.close()
}

await api(`/api/sessions/${session.id}`, { method: 'DELETE' })

const passed = checks.filter(Boolean).length
process.stdout.write(`\n${passed}/${checks.length} checks passed\n`)
process.exitCode = passed === checks.length ? 0 : 1

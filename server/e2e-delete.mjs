/**
 * Deleting sessions and projects, against a real gateway, database and tmux.
 *
 * The two checks that matter are the ones a unit test cannot make: that
 * deleting a session really kills its tmux session, and that deleting a project
 * really does leave its directory on disk — the confirmation dialog promises
 * exactly that, and a wrong promise there costs someone their code.
 */
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:3001'
const DB = process.env.DB ?? './data/termspace.db'
const ROOT = process.env.ROOT ?? '/srv/projects'
let cookie = ''

const checks = []
function check(name, passed, detail = '') {
  checks.push(passed)
  process.stdout.write(
    `${passed ? '  ok  ' : ' FAIL '} ${name}${detail === '' ? '' : ` — ${detail}`}\n`,
  )
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
  const text = await response.text()
  return { status: response.status, body: text === '' ? null : JSON.parse(text) }
}

function tmuxHas(sessionId) {
  try {
    const names = execFileSync('tmux', ['ls', '-F', '#{session_name}'], { encoding: 'utf8' })
    return names.split('\n').includes(`ts_${sessionId}`)
  } catch {
    return false
  }
}

const { generate } = await import('otplib')
const db = new DatabaseSync(DB, { readOnly: true })
const secret = db.prepare('select totp_secret from users where username = ?').get('operator')
  .totp_secret
db.close()

const login = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({
    username: 'operator',
    password: process.env.PASSWORD,
    totp: await generate({ secret }),
  }),
})
check('login', login.status === 200, `status ${login.status}`)
if (login.status !== 200) process.exit(1)

const path = `${ROOT}/deletable`
const project = (
  await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: 'Deletable', path, createDirectory: true }),
  })
).body.data
check('a project is created', project?.id !== undefined)
check('its directory is on disk', existsSync(path))

// Something the user would be upset to lose.
writeFileSync(`${path}/important.txt`, 'do not delete me\n')

const session = (
  await api('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ projectId: project.id, name: 'doomed', agent: 'shell' }),
  })
).body.data
check('a session is created', session?.id !== undefined)
await new Promise((resolve) => setTimeout(resolve, 400))
check('its tmux session exists', tmuxHas(session.id))

const busy = await api(`/api/projects/${project.id}`, { method: 'DELETE' })
check('a project with sessions refuses to delete', busy.status === 400, `status ${busy.status}`)
check(
  'and says why, in the field the form can point at',
  busy.body?.error?.code === 'validation_failed',
  JSON.stringify(busy.body?.error),
)
check('the project is still there', (await api('/api/projects')).body.data.length === 1)

const deletedSession = await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
check('the session deletes', deletedSession.status === 200, `status ${deletedSession.status}`)
await new Promise((resolve) => setTimeout(resolve, 400))
check('its tmux session is really gone', !tmuxHas(session.id))
check('it is gone from the list', (await api('/api/sessions')).body.data.length === 0)

const missingSession = await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
check(
  'deleting it twice is a 404, not a 500',
  missingSession.status === 404,
  `status ${missingSession.status}`,
)

const deletedProject = await api(`/api/projects/${project.id}`, { method: 'DELETE' })
check('the project now deletes', deletedProject.status === 200, `status ${deletedProject.status}`)
check('it is gone from the list', (await api('/api/projects')).body.data.length === 0)

// The promise the confirmation dialog makes.
check('the project directory is left on disk', existsSync(path))
check('and so is the file in it', existsSync(`${path}/important.txt`))

const missingProject = await api(`/api/projects/${project.id}`, { method: 'DELETE' })
check(
  'deleting it twice is a 404, not a 500',
  missingProject.status === 404,
  `status ${missingProject.status}`,
)

const unauthenticated = await fetch(`${BASE}/api/projects/${project.id}`, { method: 'DELETE' })
check(
  'deleting without a session is refused',
  unauthenticated.status === 401,
  `status ${unauthenticated.status}`,
)

const passed = checks.filter(Boolean).length
process.stdout.write(`\n${passed}/${checks.length} checks passed\n`)
process.exitCode = passed === checks.length ? 0 : 1

# Contracts

This is the seam. It is the only place the two agents actually meet, and it is
the reason they can work at the same time without blocking each other.

**The contract is code, not prose.** Every type below lives in
`packages/contracts/src/`. Prose here explains intent; the TypeScript is
authoritative. If they disagree, the TypeScript wins and the prose gets fixed.

## Rules for changing it

1. Either agent may **propose** a change. Neither may merge one alone.
2. To propose: append a block to `## Proposals` at the bottom of this file,
   commit it alone with message `contract: propose <thing>`, and append a
   `BLOCKED` entry to `docs/PROGRESS.md` naming the proposal.
3. The other agent reads it at the start of its next session and replies in the
   same block with `AGREED` or a counter.
4. Once both have written `AGREED`, whoever proposed it edits
   `packages/contracts/src/`, moves the block to `## Settled`, and appends a
   `CONTRACT` entry to `docs/PROGRESS.md`.
5. Never change a shipped type in place. Add the new shape, migrate, delete the
   old one in a later commit.

While a proposal is open, keep working on anything that does not depend on it.
Do not sit idle waiting.

## Transport

One WebSocket for the whole page at `wss://host/ws?ticket=<t>`. Every frame is
JSON except terminal output, which is a binary frame prefixed with a 16-byte
ASCII session id for throughput.

### Client to server

```ts
type ClientFrame =
  | { t: 'sub';    sid: string }
  | { t: 'unsub';  sid: string }
  | { t: 'in';     sid: string; data: string }
  | { t: 'resize'; sid: string; cols: number; rows: number }
  | { t: 'vis';    sid: string; level: 'focused' | 'visible' | 'hidden' }
  | { t: 'ping' }
```

`vis` drives server-side coalescing. The client is responsible for sending it
on every focus and visibility change; the server defaults a new subscription to
`visible`.

### Server to client

```ts
type ServerFrame =
  | { t: 'restore'; sid: string; data: string }
  | { t: 'status';  sid: string; state: SessionState; since: number }
  | { t: 'title';   sid: string; title: string }
  | { t: 'exit';    sid: string; code: number | null }
  | { t: 'truncated'; sid: string }
  | { t: 'error';   sid: string | null; code: string; message: string }
  | { t: 'pong' }

type SessionState = 'working' | 'idle' | 'needs-you' | 'dead'
```

Terminal output does **not** appear here. It arrives as binary frames.

## Core types

```ts
interface Project {
  id: string
  slug: string
  name: string
  path: string
  repoUrl: string | null
  defaultBranch: string
  setupCommand: string | null
  createdAt: number
}

type AgentKind = 'claude' | 'codex' | 'shell'

interface Session {
  id: string
  projectId: string
  name: string
  agent: AgentKind
  cwd: string
  worktreeBranch: string | null
  state: SessionState
  title: string | null
  lastActivityAt: number
  createdAt: number
}
```

## HTTP surface

Every response is `{ ok: true, data: T }` or `{ ok: false, error: ApiError }`.
Never a bare array, never a bare string. `ApiError` is
`{ code: string; message: string; field?: string }`.

| Method | Path | Body | Returns | Phase |
|---|---|---|---|---|
| GET | `/api/health` | — | `{version}` | 0 |
| POST | `/api/auth/login` | `{username, password, totp}` | `{user}` | 1 |
| POST | `/api/auth/logout` | — | `{}` | 1 |
| GET | `/api/auth/me` | — | `{user}` | 1 |
| POST | `/api/ws-ticket` | — | `{ticket, expiresAt}` | 1 |
| GET | `/api/sessions` | — | `Session[]` | 1 |
| POST | `/api/sessions` | `CreateSessionInput` | `Session` | 1 |
| DELETE | `/api/sessions/:id` | — | `{}` | 1 |
| GET | `/api/projects` | — | `Project[]` | 2 |
| POST | `/api/projects` | `CreateProjectInput` | `Project` | 2 |
| DELETE | `/api/projects/:id` | — | `{}` | 2 |
| GET | `/api/layouts` | — | `Layout` | 2 |
| PUT | `/api/layouts` | `Layout` | `Layout` | 2 |
| POST | `/api/push/subscribe` | `PushSubscription` | `{}` | 3 |
| GET | `/api/sessions/:id/diff` | — | `DiffResult` | 4 |

Error codes are a closed union in `packages/contracts/src/errors.ts`. The
frontend switches on `code`, never on `message`.

## Fixtures

`packages/contracts/src/fixtures.ts` exports a valid instance of every type.
The frontend builds against fixtures from day one and does not wait for a live
backend. The backend has a test asserting its real responses satisfy the same
types.

This is what makes parallel work real rather than theoretical: **the frontend
is never blocked on the backend, because the fixture is the backend until the
backend exists.**

---

## Proposals

_(open proposals go here — newest at the top)_

## Settled

_(agreed and implemented proposals move here)_

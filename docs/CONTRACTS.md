# Contracts

This is the seam between the server and web client. One developer owns both,
but designing the seam first still prevents the two implementations from
drifting.

**The contract is code, not prose.** Every type below lives in
`packages/contracts/src/`. Prose here explains intent; the TypeScript is
authoritative. If they disagree, the TypeScript wins and the prose gets fixed.

## Rules for changing it

1. Design the shared shape and compatibility behavior before either side uses
   it.
2. Implement the runtime type, fixtures, server boundary, and client parser in
   the same development slice.
3. Prefer additive migration. Never silently reinterpret a shipped field.
4. Append a `CONTRACT` progress entry stating the exact old and new surface.
5. The TypeScript in `packages/contracts/src/` is authoritative; correct this
   prose immediately whenever it falls behind.

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
  agentCommands: Partial<Record<AgentKind, readonly string[]>>
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
  hasCwdConflict: boolean
  state: SessionState
  title: string | null
  lastActivityAt: number
  createdAt: number
}

type CreateSessionInput = {
  projectId: string
  name: string
  agent: AgentKind
} & (
  | { worktree?: false; cwd?: string }
  | { worktree: true; worktreeBranch: string }
)

interface DiffResult {
  sessionId: string
  baseBranch: string
  files: readonly DiffFile[]
  patch: string
  truncated: boolean
}

type LayoutMode = 'single' | 'split' | 'grid' | 'tabs'

interface Layout {
  mode: LayoutMode
  slots: readonly (string | null)[]
  focusedSlot: number
  updatedAt: number
}

type LayoutInput = Omit<Layout, 'updatedAt'>
```

`slots` is always `LAYOUT_MAX_SLOTS` long whatever the mode, so switching from
`grid` to `single` and back does not throw away what was in slots 2-4. The mode
decides how many slots are *live* (`LAYOUT_SLOT_CAPACITY`), not how many exist;
`tabs` keeps all of them and paints `focusedSlot`. A session id appears at most
once — two panes on one tmux session would fight over its size.

`normalizeLayout` in `layout.ts` is the single definition of well-formed, shared
by both sides: the server runs it before storing and the client after every
local edit. It is total and idempotent, because the failure mode of a rejected
layout is a workspace that will not render.

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
| GET | `/api/config` | — | `AppConfig` | 2 |
| GET | `/api/sessions` | — | `Session[]` | 1 |
| POST | `/api/sessions` | `CreateSessionInput` | `Session` | 1 |
| DELETE | `/api/sessions/:id?force=true` | — | `{}` | 1 / 4 |
| GET | `/api/projects` | — | `Project[]` | 2 |
| POST | `/api/projects` | `CreateProjectInput` | `Project` | 2 |
| PATCH | `/api/projects/:id` | `UpdateProjectInput` | `Project` | 2 |
| DELETE | `/api/projects/:id` | — | `{}` | 2 |
| GET | `/api/layouts` | — | `Layout` | 2 |
| PUT | `/api/layouts` | `LayoutInput` | `Layout` | 2 |
| GET | `/api/push` | — | `PushStatus` | 3 |
| POST | `/api/push/subscriptions` | `PushSubscriptionInput` | `{}` | 3 |
| DELETE | `/api/push/subscriptions` | `{endpoint}` | `{}` | 3 |
| GET | `/api/sessions/:id/diff` | — | `DiffResult` | 4 |
| GET | `/api/favorites` | — | `Favorites` | 6 |
| PUT | `/api/favorites` | `Favorites` | `Favorites` | 6 |
| GET | `/api/operations` | — | `OperationalStatus` | 6 |

Error codes are a closed union in `packages/contracts/src/errors.ts`. The
frontend switches on `code`, never on `message`.

## Fixtures

`packages/contracts/src/fixtures.ts` exports a valid instance of every type.
The frontend builds against fixtures from day one and does not wait for a live
backend. The backend has a test asserting its real responses satisfy the same
types.

Fixtures keep UI states testable without a running gateway and make contract
drift visible before it reaches a browser.

## Operations and favorites

`Favorites` stores ordered project and session id lists per user. Reads omit
ids whose entities no longer exist, making manual filesystem cleanup and later
entity deletion harmless to the UI.

`OperationalStatus` is an authenticated, bounded snapshot rather than a log
reader. It reports gateway uptime, live and persisted session counts, filesystem
capacity, database and backup size/age, and the active resource policies.
`recentEvents` contains only explicitly allowlisted event kinds with summaries
constructed from safe structured fields. Raw journal messages are never part of
the contract. Nullable metrics and `eventsAvailable` distinguish unavailable
telemetry from real zero values.

---

## Settled

### 2026-08-17 · SOLO · Phase 4 worktrees and diffs

- Existing `CreateSessionInput` requests remain valid. `worktree: true` requires
  `worktreeBranch` and excludes caller-supplied `cwd`; the server owns the
  worktree directory.
- `Session.hasCwdConflict` is derived on reads. It is true only when two or more
  non-worktree sessions use the same cwd.
- Normal delete refuses a dirty worktree with `worktree_dirty`; `force=true` is
  the only request that may discard its uncommitted files. Removing a worktree
  does not delete its branch or commits.
- `DiffResult` returns bounded file metadata and a unified tracked-file patch.
  Untracked files appear in the file list even though the patch does not copy
  their contents. `truncated` makes safety limits visible rather than silently
  presenting a partial review as complete.

### 2026-08-10 · FRONTEND · The shapes this file names but never defines

`packages/contracts/src/` now exists and exports everything this file writes out
as TypeScript. Four things are named here without a shape, so they are not in the
package. Nothing in phase 0 needs them; phase 1 needs all four on day one.

Deliberately **not** proposed yet: `Layout`, `DiffResult`, and the push
subscription body. They belong to phases 2–4 and proposing them now would be
guessing at requirements neither of us has met.

**1. `ErrorCode` — the closed union in `errors.ts`**

This file mandates the file and says the frontend switches on `code`, but lists
no members. Proposed starting set, covering phase 1 only:

```ts
export type ErrorCode =
  | 'unauthorized'
  | 'invalid_credentials'
  | 'rate_limited'
  | 'ticket_invalid'
  | 'ticket_expired'
  | 'origin_rejected'
  | 'session_not_found'
  | 'session_dead'
  | 'validation_failed'
  | 'internal_error'
```

`ApiError.code` stays `string` on the wire so an unknown code from a newer
server does not fail parsing; `ErrorCode` is what the frontend switches on, with
a default branch. Adding a member is additive and needs no proposal. Removing or
renaming one does.

The frontend also mints two codes of its own for failures where the server
produced no valid envelope at all — `client_network_unreachable` and
`client_malformed_response`. They live in `web/` and never cross the wire. The
backend must never send a code with a `client_` prefix.

**2. `User` — returned by `/api/auth/login` and `/api/auth/me` as `{user}`**

```ts
interface User {
  id: string
  username: string
  createdAt: number
}
```

No password hash, no TOTP secret, no roles. If the backend needs a field here,
say which and why.

**3. `CreateSessionInput` — the body of `POST /api/sessions`**

```ts
interface CreateSessionInput {
  projectId: string
  name: string
  agent: AgentKind
  cwd?: string
}
```

`cwd` omitted means the project path. `worktree` is deliberately absent — it
arrives in phase 4 and adding it then is additive.

**4. Session id width — the one that matters now**

Terminal output is "a binary frame prefixed with a 16-byte ASCII session id".
That makes the id width part of the wire format, and this file never pins it
down. Proposed: **a session id is exactly 16 ASCII bytes**, so the prefix is
never padded and the decoder is a fixed slice with no sentinel to agree on.
The fixtures already assume this and a test in `packages/contracts` enforces it.

If ids are instead variable-length and padded, the padding byte has to be
written down here — `0x20` and `0x00` are both defensible and a mismatch shows
up as a corrupted session id at runtime, not at compile time.

CLAUDE CODE: proposed.
CODEX: AGREED.

**SETTLED 2026-08-10.** Implemented in `packages/contracts/src/errors.ts`,
`auth.ts`, and `core.ts`, with tests. Two shapes the HTTP table already spelled
out went in alongside them, specified to the same degree as `{version}` was:
`LoginInput` (`{username, password, totp}`) and `WsTicket`
(`{ticket, expiresAt}`). Both are additive — counter them if they are wrong.

`SESSION_ID_BYTES` was deliberately **not** added. The agreement makes the
session id width and the binary frame prefix width the same number, so
`BINARY_SID_BYTES` is the one constant for both.

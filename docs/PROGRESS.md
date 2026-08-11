# Progress log

Append-only. Newest at the bottom. Never edit or delete another agent's entry;
never edit your own after committing it. If you were wrong, append a correction.

Both agents read the last 30 entries at the start of every session, before
touching any code. This file is how you find out what the other one did while
you were not running.

## Entry format

```
### <ISO timestamp> · <BACKEND|FRONTEND> · <phase> · <KIND>
<one line: what changed, in the imperative>
<optional: second line, only if the other agent needs to know something>
```

`KIND` is one of:

| Kind | Use it when |
|---|---|
| `DONE` | A checklist item in `docs/PHASES.md` is now true |
| `WIP` | You are partway through something and stopping for now |
| `BLOCKED` | You cannot proceed and need the other agent or the human |
| `CONTRACT` | A contract proposal was opened, agreed, or implemented |
| `DECISION` | You chose between real alternatives — also add to `docs/DECISIONS.md` |
| `BROKE` | You changed something that invalidates the other agent's work |
| `GATE` | You have ticked your box for a phase |

`BROKE` is the important one. If you rename a field, change an error code, or
alter a frame shape, the other agent is about to waste an hour. Say so in the
same commit that does it.

## Rules

- Append **before** you commit, in the same commit as the work
- One entry per meaningful unit — not per file, not per session
- Keep it to two lines. This is a log, not a report.
- Never write "made progress on X". Say what is now true that was not before.

## Log

### 2026-01-01T00:00:00Z · HUMAN · 0 · DECISION
Initialise the repository from the scaffold; Codex owns `server/`, Claude Code owns `web/`.
Start at phase 0. Do not begin phase 1 until both gate boxes are ticked.

### 2026-08-10T13:29:23+03:30 · BACKEND · 0 · DONE
Add the pnpm workspace and strict Node 22 server package; recursive backend typechecking passes.

### 2026-08-10T13:33:10+03:30 · BACKEND · 0 · DONE
Add transactional SQLite migrations and constrained schemas for users, projects, sessions, and layouts.

### 2026-08-10T13:35:54+03:30 · BACKEND · 0 · DONE
Boot Fastify with automatic migrations; live `/api/health` returns `{ok:true,data:{version:"0.0.0"}}`.

### 2026-08-10T13:56:55+03:30 · BACKEND · 0 · DONE
Set tmux `window-size latest`; an isolated real tmux session loads and reports the option.

### 2026-08-10T14:02:29+03:30 · BACKEND · 0 · DONE
Add `pnpm seed:user` with hidden password input, argon2id storage, TOTP generation, and otpauth output.

### 2026-08-10T14:03:27+03:30 · BACKEND · 0 · GATE
Tick the Phase 0 backend gate after Node 22 root typechecks/tests and live health, seed, and tmux checks pass.

### 2026-08-10T15:09:00+03:30 · FRONTEND · 0 · DONE
Add `@termspace/contracts` to the workspace, exporting every type this repo's `docs/CONTRACTS.md` writes out, plus a fixture for each and a test that no frame variant or union member is missing one.
The package resolves to built `dist`, so a NodeNext consumer can import it; `pnpm install` builds it via `prepare`.

### 2026-08-10T15:09:30+03:30 · FRONTEND · 0 · BLOCKED
`server/` does not depend on `@termspace/contracts`, so the shared box "both packages import from it" is half-done and I cannot finish it.
Codex: add `"@termspace/contracts": "workspace:*"` to `server/package.json` and import `Session`/`Project`/`ServerFrame` from it instead of any local shape. Nothing else is needed from you.

### 2026-08-10T15:10:00+03:30 · FRONTEND · 0 · CONTRACT
Propose the four shapes `docs/CONTRACTS.md` names but never defines: the `ErrorCode` union, `User`, `CreateSessionInput`, and the session id width.
The id width is the urgent one — a 16-byte binary prefix makes id length part of the wire format, and fixtures now assume ids are exactly 16 ASCII bytes.

### 2026-08-10T15:10:30+03:30 · FRONTEND · 0 · DONE
Scaffold `web/` as a strict-TS Next.js App Router package: login shell with a TOTP field, workspace shell with sidebar plus a placeholder pane, light and dark from `prefers-color-scheme`, plain CSS modules and no component library.
All data goes through one swappable source in `web/src/lib/data`; `NEXT_PUBLIC_TERMSPACE_DATA=http` is the whole switch from fixtures to the real backend.

### 2026-08-10T15:11:00+03:30 · FRONTEND · 0 · DONE
`pnpm dev` starts the contracts watcher, the server watcher, and `next dev` together; the web port is `PORT`, defaulting to 3000.

### 2026-08-10T15:12:00+03:30 · FRONTEND · 0 · GATE
Tick the phase 0 frontend gate: all four frontend boxes done, root `pnpm typecheck` and `pnpm test` pass across all three packages, both shells render under `next build` and `next dev`.
The remaining shared box needs `server/` to depend on the contracts package, which is Codex's edit — see the BLOCKED entry above.

### 2026-08-10T15:57:38+03:30 · BACKEND · 1 · CONTRACT
Agree the proposed Phase 1 ErrorCode, User, CreateSessionInput, and exact 16-byte session-id contracts.

### 2026-08-10T15:58:37+03:30 · BACKEND · 0 · DONE
Import health response types and fixtures from `@termspace/contracts`; all three packages typecheck cleanly.

### 2026-08-10T16:01:26+03:30 · BACKEND · 1 · WIP
Add tested hashed auth sessions, bounded login throttling, and single-use expiring WebSocket tickets for route wiring.

### 2026-08-10T16:03:12+03:30 · BACKEND · 1 · WIP
Add strict ClientFrame decoding, exact 16-byte terminal output encoding, and configured WebSocket Origin validation.

### 2026-08-10T16:10:32+03:30 · BACKEND · 1 · WIP
Add fixed-width session ids and an injectable tmux client; real detached create/cwd/targeted-kill verification passes.

### 2026-08-10T16:13:11+03:30 · BACKEND · 1 · WIP
Add shared-type SQLite session persistence and tmux-first create/delete orchestration with rollback tests.

### 2026-08-10T16:18:41+03:30 · BACKEND · 1 · WIP
Add per-viewer node-pty attachments and serialized headless restore buffers; live viewer close leaves tmux alive.

### 2026-08-10T16:20:48+03:30 · BACKEND · 1 · WIP
Add bounded 16 ms focused-output coalescing with deterministic flush, truncation, and disposal tests.

### 2026-08-10T16:22:56+03:30 · BACKEND · 1 · WIP
Add constant-channel argon2id/TOTP authentication, strict cookie codec, and validated credential lookup.

### 2026-08-10T16:26:17+03:30 · BACKEND · 1 · WIP
Compose multiplexed subscription ownership, single-writer headless buffering, restore, PTY routing, and binary output.

### 2026-08-10T16:28:53+03:30 · BACKEND · 1 · WIP
Add no-cookie WebSocket upgrade handling that checks exact Origin before redeeming one single-use ticket.

### 2026-08-10T16:41:38+03:30 · BACKEND · 1 · WIP
Compose the live runtime and validate production Origin config; health and foreign-Origin rejection pass live.

### 2026-08-10T16:41:38+03:30 · BACKEND · 1 · BLOCKED
Frontend proposer: implement the agreed ErrorCode, User, CreateSessionInput, and 16-byte-id proposal in contracts so typed Phase 1 HTTP routes can land.

### 2026-08-10T16:43:39+03:30 · BACKEND · 1 · DONE
Authenticate and multiplex `/ws` with exact Origin plus a single-use ticket; live same-Origin ping/pong passes.

### 2026-08-10T16:43:39+03:30 · BACKEND · 1 · DONE
Attach one node-pty tmux client per viewer; live input/output works and viewer close leaves tmux alive.

### 2026-08-10T16:43:39+03:30 · BACKEND · 1 · DONE
Restore sessions through a serialized headless xterm with tmux capture fallback; live subscription receives restore first.

### 2026-08-10T16:43:39+03:30 · BACKEND · 1 · DONE
Coalesce focused output at 16 ms with a byte ceiling; live terminal output arrives as exact-prefix binary frames.

### 2026-08-10T16:58:35+03:30 · FRONTEND · 1 · CONTRACT
Implement the agreed proposal and move it to `## Settled`: `ErrorCode` + `isErrorCode` in `errors.ts`, `User`/`LoginInput`/`WsTicket` in `auth.ts`, `CreateSessionInput` in `core.ts`, fixtures and tests for each.
Codex: this clears your 16:41 BLOCKED entry — the typed HTTP routes can land. `LoginInput` and `WsTicket` were transcribed from the HTTP table rather than proposed; counter them if wrong. There is no `SESSION_ID_BYTES`, because `BINARY_SID_BYTES` is the same number by the agreement.

### 2026-08-10T17:11:43+03:30 · BACKEND · 1 · DONE
Authenticate login with argon2id, TOTP, per-client throttling, and a hardened session cookie; expose authenticated logout and current-user routes.

### 2026-08-10T17:11:43+03:30 · BACKEND · 1 · DONE
Issue authenticated, user-bound, single-use WebSocket tickets with the agreed 10-second lifetime.

### 2026-08-10T17:11:43+03:30 · BACKEND · 1 · DONE
Create, list, and delete authenticated sessions through validated HTTP envelopes; a live API flow creates and removes a real detached tmux session.

### 2026-08-10T17:11:43+03:30 · BACKEND · 1 · GATE
Tick the Phase 1 backend gate after all backend boxes, Node 22 workspace checks, and the live auth/ticket/tmux CRUD flow pass.

### 2026-08-10T17:50:52+03:30 · FRONTEND · 1 · DONE
Add the client frame codec: binary output splits at a fixed 16-byte ASCII prefix and the payload stays raw bytes so a UTF-8 sequence split across frames is not corrupted; `ServerFrame` is zod-parsed, and outbound frames are clamped to the server's own bounds (cols 2-500, rows 1-300, `in` <= 65536) so the client cannot emit a frame the gateway will drop.

### 2026-08-10T17:50:52+03:30 · FRONTEND · 1 · DONE
Add `useSocket` over one multiplexed `GatewayClient`: fresh single-use ticket per connect, full-jitter exponential backoff capped at 15 s, every pane resubscribed with `sub`+`vis` on reopen, and full disposal on unmount. Ticket is never persisted.

### 2026-08-10T17:50:52+03:30 · FRONTEND · 1 · DONE
Add the live `xterm.js` pane: `restore` is applied and only then is `onData` wired, `ResizeObserver` is debounced at 100 ms through the fit addon, and `vis` is sent on focus, blur, and `visibilitychange`.

### 2026-08-10T17:50:52+03:30 · FRONTEND · 1 · DONE
Add working login against `POST /api/auth/login` with TOTP, per-`ErrorCode` messages and a redirect to `/workspace`; the workspace guards on `GET /api/auth/me` and shows connected / reconnecting / disconnected.

### 2026-08-10T17:50:52+03:30 · FRONTEND · 1 · DECISION
Proxy `/api/*` and `/ws` through Next in dev so the browser sees one origin, matching the production Caddy topology. Without it the cookie and the WebSocket `Origin` check both fail cross-port. Override the gateway with `TERMSPACE_GATEWAY_ORIGIN`.
The data layer now defaults to the real backend; `NEXT_PUBLIC_TERMSPACE_DATA=fixtures` puts the UI back on fixtures with no gateway running.

### 2026-08-10T17:50:52+03:30 · FRONTEND · 1 · GATE
Tick the Phase 1 frontend gate. Verified live against the real gateway, not fixtures: login, a rejected TOTP returning `invalid_credentials`, session create/delete, ticket redemption, `restore` arriving before any output, and a shell round trip through binary frames.
Exit criteria met — with a shell variable set, `SIGKILL` on the Node process, restart, and the client reconnected on its own to a fresh `restore` with the variable still set. tmux kept the process. Codex: `node-pty`'s native binding was built for Node 22 (ABI 127) and fails to load on Node 24; I rebuilt it locally to run this.

### 2026-08-11T11:58:00+03:30 · SOLO · 2 · CONTRACT
Add `AppConfig { projectRoot }` and `GET /api/config`, authenticated. The
new-project form has to know where project directories are allowed to live, or
the only way to discover the root is to submit and read the error.

### 2026-08-11T11:58:00+03:30 · SOLO · 2 · DONE
The app is usable from a browser. New-project and new-session dialogs on the
native `<dialog>` element, so focus containment, focus restore, Escape, and
inertness behind the modal are the browser's and not ours — no component
library. The project path is suggested from the name under the server's root and
stops being suggested the moment the field is touched. Empty states lead
somewhere: no projects offers "Add a project", no sessions offers "New session",
and creating a project goes straight on to creating a session in it.
Verified cold from an empty database: sign in, read config, add a project, start
a session, attach, `pwd` in the project directory, restart the gateway, and both
are still there. Nothing in that path needs curl or SQL any more.

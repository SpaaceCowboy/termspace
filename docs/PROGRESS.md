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

### 2026-08-11T15:40:00+03:30 · SOLO · 2 · CONTRACT
Add `Layout`, `LayoutInput`, `LayoutMode`, and `normalizeLayout` to contracts.
`slots` is always `LAYOUT_MAX_SLOTS` (8) long whatever the mode, so narrowing
from `grid` to `single` and back does not throw away what was in slots 2-4 —
the mode decides how many slots are live, not how many exist. A session id
appears at most once: two panes on one tmux session would fight over its size.
`normalizeLayout` is the single definition of well-formed and is shared by both
sides — the server runs it before storing, the client after every local edit.
It is total and idempotent, because the failure mode of a rejected layout is a
workspace that will not render.

### 2026-08-11T15:40:00+03:30 · SOLO · 2 · DONE
Slice 3 — layouts and the grid. `GET`/`PUT /api/layouts`, keyed by user, with a
`LayoutRepository` that validates stored JSON on the way out rather than
trusting it, and empties slots whose session no longer exists so deleting a
session in one tab cannot leave a ghost pane in another.

The grid renders 1 / 2 / 2×2 / tabs, switchable from a toolbar and persisted
debounced. Terminals now live in a `PaneStore` outside React, one per subscribed
session, so re-rendering, changing mode, or switching tabs never costs a
reattach. A pane that is not on screen holds a headless terminal — created,
written to, never `open()`ed — and stays subscribed, so its screen is current
the instant it is shown. Moving between headless and open rehosts through a
serialized snapshot instead of asking the server for the screen again. Output
arriving mid-rehost is held and replayed in order rather than dropped.

Verified against the real gateway, database, and tmux: 15/15 checks on the
layouts API, including that a four-pane grid round-trips, that narrowing to one
pane keeps the other three parked, that a session cannot occupy two panes, that
a slot naming a deleted session is emptied rather than the whole write refused,
that malformed layouts are rejected without disturbing what is stored, and that
deleting a session empties its pane on the next read.

### 2026-08-11T15:40:00+03:30 · SOLO · 2 · DECISION
WebGL stays confined to the focused pane, but the other panes get xterm's own
renderer rather than the canvas addon: `@xterm/addon-canvas` has no release for
xterm 6 (its latest still peers `@xterm/xterm ^5.0.0`), while fit, serialize,
and webgl all do. This deviates from the letter of the "canvas elsewhere" rule
in `CLAUDE.md` and keeps what the rule protects — browsers cap live WebGL
contexts and a blown context renders blank.

### 2026-08-11T15:40:00+03:30 · SOLO · 2 · DECISION
`next.config.ts` takes `TERMSPACE_DIST_DIR`. A `pnpm build` run while a
`next dev` is up on the same checkout leaves both with a half-written `.next`,
and the symptom is a dev server serving HTML for chunks that 404.

### 2026-08-11T16:25:00+03:30 · SOLO · 2 · CONTRACT
Add `CreateProjectInput.createDirectory` and `AppConfig.projectRootWritable`,
both additive. A project can now come from three places, not two: adopt a
directory that exists, clone a repo into one that does not, or **start empty**
and have the server make the directory. `createDirectory` and `repoUrl` are
mutually exclusive — a clone makes the directory itself.

### 2026-08-11T16:25:00+03:30 · SOLO · 2 · DONE
Fix "add a project" being impossible without a shell. Three failures stacked up:

1. Starting a new empty project was never a supported path — only adopt or
   clone — so the obvious flow (type a name, take the suggested directory,
   submit) always failed. The dialog now asks where the code comes from
   instead of inferring it from whether the repo field is blank.
2. `TERMSPACE_PROJECT_ROOT` defaults to `/srv/projects`, which on a dev box
   does not exist and cannot be created by an unprivileged user. The server now
   creates the root at startup when it can, and logs a loud, actionable error
   when it cannot, rather than leaving every create to fail at the far end of a
   form. `GET /api/config` reports `projectRootWritable` so the dialog says so
   before you type anything.
3. The advice in the error was wrong: it told you to clone into a root that
   would have rejected a clone too.

The created directory is 0700, and containment is re-checked *after* the mkdir
— the check before it cannot be a lock, and a symlink swapped in between would
otherwise land a project outside the root. If that check fails, the directory
this process just made is removed again.

Verified against a real gateway and a real disk, 10/10: a gateway pointed at a
root that does not exist creates it and boots; the exact request that used to
fail now succeeds with `createDirectory`; the directory really is on disk at
0700; a second project cannot claim it; clone-and-create together is refused
with nothing written; `createDirectory` cannot escape the root; and a session
starts in the directory that was just made. Against an unwritable root, the
boot log, `GET /api/config`, and the create error all say the same thing.

### 2026-08-11T17:05:00+03:30 · SOLO · 2 · DECISION
Decision #6: the app runs with root privileges, superseding non-negotiable #3.
The owner is the only user and wants `apt install` to work inside a session.
Recorded with the cost stated plainly — prompt injection now reaches root, an
auth flaw becomes remote root, and the phase 5 systemd unit goes from being a
second boundary to being the only one.

### 2026-08-11T17:05:00+03:30 · SOLO · 2 · DONE
A pane can no longer end up permanently unable to accept a keystroke. Input was
wired only after a `restore` was applied, so a restore that never landed left a
pane that renders output and swallows every key — with nothing in the UI to say
why. Input is now wired the moment a terminal exists, and keystrokes typed
before the restore are held and sent in order once it lands, which keeps what
the rule was protecting (nothing acts on a buffer the server is about to
overwrite) without the dead-pane failure mode. Terminal creation errors reach
the UI instead of being swallowed by an unset `onError`.

### 2026-08-11T13:54:10+03:30 · SOLO · 2 · FIXED
Every WebSocket upgrade from a browser was rejected, so no pane anywhere could
accept a keystroke — the symptom looked like a terminal bug and was a config
default. `TERMSPACE_ALLOWED_ORIGIN` defaulted to `http://localhost:3000` while
`web` serves on 3002 and `isAllowedOrigin` is an exact string match. There is no
`.env` in the repo, so the default is what every dev box actually ran. The
ticket was never examined; each 403 burned a fresh ticket for nothing.

Three changes, and the second is the one that matters long term:
1. The default is now `http://localhost:3002`, with a test asserting it matches
   the port `web/package.json` serves on so the two cannot drift apart again.
2. A rejected upgrade is no longer invisible. `WebSocketGatewayServer` takes an
   `onRejected` hook reporting reason, received Origin, and configured Origin;
   `origin_rejected` logs at `error` with the exact remedy, everything else at
   `warn`. Previously the server said nothing and the browser said `403` with an
   empty body, which is indistinguishable from an expired ticket.
3. The accepted Origin is logged once at boot.

Verified live against a real gateway: with a deliberately bogus ticket, Origin
`http://localhost:3002` reaches the ticket check and returns 401, while
`http://localhost:3000` is refused at 403 and logs the actionable error. That
second case is the old default, so it is also a reproduction of the bug. 133/133
server unit tests pass.

Not covered: `server/e2e-ws.mjs` drives the whole path including a real login
and a keystroke round-tripping through tmux, and still has not been run — it
needs the operator's TOTP secret.

### 2026-08-11T14:26:00+03:30 · SOLO · 2 · FIXED
A pane rendered nothing and accepted no input even with the socket connected and
the session alive. Two independent client bugs, either of which alone produces
"the terminal is broken":

1. `@xterm/xterm/css/xterm.css` was never imported anywhere. That stylesheet is
   not cosmetic — it is what moves `.xterm-helper-textarea` off-screen
   (`position: absolute; opacity: 0; left: -9999em`) and positions the rows and
   viewport. Without it nothing paints and the bare textarea renders as a small
   box in the pane's top-left corner. Imported in the root layout.
2. Nothing in `web/**` ever called `terminal.focus()`; `PaneTerminal` did not
   expose it. `focusedSlot` only ever decided which pane got WebGL. xterm reads
   keystrokes from that hidden textarea, so with no DOM focus the pane was
   permanently deaf. `PaneTerminal.focus`, `PaneStore.focus(sid)`, and
   `PanesApi.focus` now exist; the grid focuses the focused slot on mount and on
   change, and on mouse-down anywhere in a pane body.

`PaneStore.focus` queues behind the entry's operations so it cannot land on a
terminal a rehost is about to replace, and is a no-op for a headless pane, which
has nothing to hand the keyboard to. Covered by a test asserting exactly that.
133/133 server and 68/68 web tests pass; both packages typecheck.

Diagnosed by capturing the tmux pane server-side: the session was alive at 94x32
running `claude` on its trust-folder prompt with a full screen of content, while
the browser showed an empty pane. That split — healthy server, blank client —
is what named the bug as rendering rather than transport.

### 2026-08-11T14:26:00+03:30 · SOLO · 2 · FIXED
Server config no longer has to be remembered by hand. There was no `.env` and no
loader, so a bare `node dist/index.js` silently took every production-shaped
default: `/srv/projects` as the project root (which no dev box has, so every
project creation failed) and the wrong allowed Origin. Both had already been
diagnosed once each and both came back the moment the gateway was restarted
without its environment.

`server/.env.example` documents the two that bite and why, and `pnpm start` and
`seed:user` load `.env` through Node's own `--env-file-if-exists` — no dotenv
dependency, no import-order trap, and the shell still wins over the file. `.env`
was already gitignored.

### 2026-08-11T15:12:00+03:30 · SOLO · 2 · DONE
Launch commands are per agent kind and configurable per project — the last
phase 2 box. `claude` and `codex` were previously hardcoded as the literal
command name, so there was no way to pass a flag to either.

A command is **argv, never a shell string**. tmux is already spawned with an
argument vector and no shell, so keeping the stored form an array means there is
no quoting layer and no metacharacter to escape — a flag is just another
element. Validation therefore bounds size rather than sanitising content, with
one exception: an argument may not contain a NUL, because `execve` truncates
there and the stored command and the executed command would silently differ.

- Contracts: `AgentCommand`, `AgentCommandOverrides`, `UpdateProjectInput`,
  `DEFAULT_AGENT_COMMANDS`, `Project.agentCommands`, and
  `AppConfig.defaultAgentCommands` so the UI can show the real default rather
  than inventing one.
- Migration 2 adds `projects.agent_commands`, defaulting to `'{}'` and not to
  the defaults themselves — baking those in would freeze today's commands into
  every row that predates the feature. An absent key keeps meaning "default".
- `PATCH /api/projects/:id`, deliberately limited to the override map: path and
  slug are identity, and changing either would orphan a project's sessions.
- The override schema is `.strict()`. zod strips unknown keys by default, which
  would have silently discarded a misspelled agent kind.
- Reads are lenient about shape: an unparseable stored value falls back to the
  default instead of taking the whole project list down.
- UI: a ⚙ per project in the sidebar opens a launch-commands dialog. A blank
  field means "use the default", shown as the placeholder. Argv is typed as
  text, so `web/src/lib/agent-command-text.ts` does quote-aware tokenising and
  the inverse — it exists to let an argument contain a space, not to emulate a
  shell, and refuses an unclosed quote rather than guessing.

Verified live, 16/16, against a real gateway, a real database and a real tmux on
a throwaway port and user: the defaults are reported, a NUL / unknown kind /
empty argument / non-array are each refused with nothing written, an override
round-trips through the database, **the overridden command is what the process
actually ran** (checked by capturing the pane, not by trusting the API), a kind
with no override still gets its default, and clearing an override restores it.
150/150 server, 76/76 web, 25/25 contracts, all three typecheck.

### 2026-08-11T15:12:00+03:30 · SOLO · 2 · GATE
Every phase 2 box is ticked. The exit criteria are the part a test cannot
settle: four sessions across two projects visible at once, the layout surviving
a reload, and a hidden pane showing correct up-to-date content the instant it is
shown. That needs a human at a browser, and until today it could not be checked
at all — the WebSocket never connected, and once it did the pane painted
nothing. Both are fixed, so this is now checkable for the first time.

Not started, and deliberately: phase 3. Also still missing, though no box claims
them — deleting a project or a session from the UI (both APIs exist and nothing
calls them), and `server/e2e-ws.mjs` has still never been run.

### 2026-08-11T15:58:00+03:30 · SOLO · 2 · DONE
A project and a session can be deleted from the UI. Both APIs had existed since
slice 1 with nothing calling them, so a project created by mistake was permanent.

Deleting a project and deleting a session destroy very different things, and the
confirmations say which:

- Deleting a **project** removes only the database row. Its directory and
  everything in it are left exactly where they are — `removeDirectory` on the
  server is only ever used to roll back a failed create. The dialog names the
  path and says nothing is deleted from it.
- Deleting a **session** kills its tmux session first, so whatever was running
  dies and the scrollback goes with it. The dialog says so plainly.

The server refuses to delete a project that still has sessions, which makes
session deletion a prerequisite rather than a separate nicety — hence both in
one change. That refusal is surfaced as the error inside the still-open dialog,
because a failed delete is the moment the user most needs to still be looking at
what they tried to delete.

Deleting a session clears it from every layout slot through `withoutSession`,
which is what releases the terminal and unsubscribes the socket. Leaving the
slot would leave a pane attached to a session id the server no longer knows.

The delete control on a session row is a sibling of the row button, not nested
inside it — nesting would be invalid markup and would break keyboard access to
the row. It is revealed on hover, on `:focus-visible`, and always where there is
no hover at all.

Verified live, 18/18, against a real gateway, database and tmux: a project with
sessions is refused with the field the form can point at, the session's **tmux
session is really gone** after deleting it, deleting either twice is a 404
rather than a 500, an unauthenticated delete is a 401, and — the promise the
dialog makes — the project directory *and a file written into it* both survive
the project being deleted. 150/150 server, 76/76 web, 25/25 contracts.

### 2026-08-11T15:58:00+03:30 · SOLO · 2 · FOUND
A session row can outlive its tmux session with nothing noticing. `test`
(`qhZHEdvZuGjwNLy7`) is in the database as `idle` while its tmux session is
gone — its `claude` process exited, and tmux ends a session when its command
does. Nothing reconciles the two, so the sidebar shows a session that cannot be
attached to. This is phase 3's `dead` state and activity tracker, not a phase 2
fix; noted here so it is not rediscovered as a mystery. The new delete button at
least makes it removable by hand.

### 2026-08-11T16:31:00+03:30 · SOLO · 2 · FIXED
The delete and launch-command controls existed but could not be found — the
first person to use them saw neither. Two causes, both mine:

1. They were dingbats (`⚙`, `×`). A font without U+2699 renders an invisible
   20px button, and there is no way to tell that from a missing feature. Both
   are now drawn as inline SVG, which depends on nothing.
2. The session delete was `opacity: 0` until `:hover`. That is undiscoverable,
   and there is no hover at all on a touch screen. It now sits at 0.45 and comes
   to full opacity on hover or `:focus-visible`.

The lesson is the second one: a control that is invisible at rest is a control
that does not exist, and "reveal on hover" is a decoration, not an affordance.

### 2026-08-11T16:04:00+03:30 · SOLO · 2 · FIXED
The project list was rejected by its own client schema, which emptied the
sidebar and reported "the server sent a response that does not match the
contract for /api/projects" — pointing squarely at the wrong half of the system.
The server was correct throughout.

In zod 4 a record keyed by an enum is **exhaustive**: `z.record(z.enum(KINDS), v)`
demands every key. `agentCommands: {}` — the normal case for a project that
overrides nothing — was therefore invalid, so every project failed to parse and
the list came back empty. With no projects there are no project headers, and
with no headers there is nowhere to hang the gear or delete buttons, which is
why they looked missing rather than broken. `z.partialRecord` is the right
constructor and is what it uses now.

`AppConfig.defaultAgentCommands` deliberately stays exhaustive: the server does
send a command for every kind there, and it should fail if it ever stops.

`ProjectSchema` and `AppConfigSchema` are now exported and covered by
`http-source.test.ts`, which parses the shared fixtures — including a project
overriding nothing, and one overriding exactly one kind — and still rejects a
project missing a required field or carrying a command that is not an array of
strings. Verified against a real server response as well as the fixtures: the
gateway sends `{}` and the client now accepts it.

Two process failures worth keeping, because each cost a round trip:
1. This shipped because every check was made against fixtures whose one project
   had an override. The empty map — the common case — was never parsed.
2. Three wrong diagnoses preceded the right one (stale bundle, then old
   gateway), each stated with more confidence than the evidence carried. The DOM
   counts that "proved" the code was compiled-but-not-rendering were equally
   consistent with old code. The fix each time was to reproduce the failure
   directly rather than reason about it.

### 2026-08-11T16:20:00+03:30 · SOLO · 2 · GATE
Phase 2 exit criteria met, confirmed by hand in a browser by the owner:
- Panes attach, restore, and take input; switching modes and tabs behaves, and a
  reload comes back with the same mode, panes, and focus.
- The project and session controls are present and work.

Phase 2 is therefore complete. Next: a UI pass over the whole app before phase 3
starts — the owner's words were that it works but is "messy and ugly". This is
deliberate sequencing, not scope creep: phase 3 adds status pills, sidebar dots,
a document title, and notification affordances, all of which are visual, and
laying them on an unresolved design means doing that work twice.

Nothing about the phase 3 checklist has been started.

### 2026-08-11T16:52:00+03:30 · SOLO · 2 · DONE
A visual pass over the whole app, before phase 3 rather than after. Direction
agreed with the owner first: "calm editor" (roomy, sans UI against mono content,
8px radii), cool slate with an indigo accent, and dark only.

**Dark only** is a deliberate subtraction. The light palette existed, was never
used, and made every colour decision a compromise between two themes. Dropping
it halves the surface and the tokens stay indirection, so a light theme can be
added later without touching a component.

**Indigo, not green.** The old accent (#4fd1a5) sat directly next to ANSI green
in the terminal output it was framing, so the chrome and the content competed.
Indigo appears in almost no terminal palette, which is exactly what chrome
wants.

What actually changed, beyond colour:
- One spacing scale (4/8/12/16/24/32) and one type scale (11/12/13/15). Every
  padding and font-size in the app is now a step on those rather than whatever
  number was typed at the time — most of the "messy" was inconsistent rhythm,
  not bad colour.
- Elevation is a step up a surface scale, never a shadow. Shadows read as
  smudges against a near-black ground.
- Project names in the sidebar are headings in sentence case, not 11px uppercase
  labels. They looked like form sections rather than places you go.
- The selected session is marked with a bar on the leading edge instead of a
  border box, which no longer competes with the focused pane's own ring.
- Tabs and the layout toolbar are one segmented control on a single shell, so a
  set of options reads as one control.
- "New project" is a real button. Dashed borders read as disabled drop zones,
  and that is the first thing a new user has to press.
- The idle pill is almost invisible on purpose: idle is the resting state and
  badging it puts noise on every pane at once. Only working / needs-you / dead
  carry colour.
- xterm's own theme now tracks the surface tokens, so there is no seam between
  a pane and the terminal inside it.

Contrast checked rather than eyeballed: every foreground/background pair in use
is AA. `--ts-text-faint` came out at 3.96 against the page background, which is
under AA for normal text and it carries real text — session metadata, hints,
placeholders — so it moved from #6b7383 to #7b8394 (4.96 on bg, 4.52 on raised).

82/82 web tests pass and the app typechecks. Phase 3 has not been started.

### 2026-08-11T17:30:00+03:30 · SOLO · 3 · DONE
Phase 3, first slice: sessions report what they are doing. Three boxes — the
activity tracker, `status` frames on change only, and the client reflecting
state — the last of which was already half built, since the pills and dots
rendered from `session.state` and nothing ever changed it.

`SessionActivityTracker` is one per process, not one per connection: state
belongs to the session, so two tabs must agree and the state has to keep
advancing while nobody is watching. It is edge-triggered — entering `working`
is caused by output, and a single timer, reset by further output, fires once 3 s
after the last byte to choose between `idle` and `needs-you`. It never emits
unless the derived state actually differs, which is what the box meant by "not
on a timer". Verified: a session left alone emits nothing at all.

Two deliberate deviations from `docs/ARCHITECTURE.md`, both now corrected in
that document rather than left as a surprise:

1. **A bare shell prompt does not mean `needs-you`.** The doc listed it as a
   pattern. A shell at its prompt is resting, not asking, and that rule puts
   every idle terminal into the one state meant to buzz a phone — which makes
   the phase 3 exit criteria meaningless. `shell` has no patterns at all.
2. **Matching is against the trailing block, not the trailing line.** A real
   permission prompt is a question, then numbered options, then a footer, so the
   last line is usually "2. No, exit" and carries none of the signal. This was
   not a guess: the first version matched the trailing line and failed against
   Claude's actual trust prompt.

State is persisted on change, because status frames are edge-triggered and a
client connecting between two edges would otherwise show whatever the row said
at creation. A subscriber is also sent the current state immediately after
`restore`, for the same reason.

The document title carries the worst state across all sessions, with
`needs-you` outranking `dead` — a dead session is over, a prompt is a person
blocked right now — and leads with a count, which is what survives a narrow tab.

Verified 7/7 against a real gateway, PTY and WebSocket: subscribing announces
the current state, output moves it to `working`, it settles to `idle`, a shell
never reaches `needs-you`, a command producing many chunks yields exactly one
`working` and one `idle` rather than a frame per chunk, a quiet session emits
nothing, and the derived state survives into the database. 163/163 server,
87/87 web, 25/25 contracts.

Not done in this slice: auto-title, Web Push, and the output coalescing tiers.

### 2026-08-11T18:20:00+03:30 · SOLO · 3 · DONE
Web Push, both halves. A session entering `needs-you` now notifies every device
that asked to be notified, and tapping the notification focuses that pane.

`web-push` is a new dependency and it earns it: Web Push needs VAPID JWT signing
plus RFC 8291 payload encryption (ECDH, HKDF, AES128GCM). That is exactly the
crypto not to hand-roll. It is confined behind a `PushSender` interface, so the
notifier's fan-out, expiry handling and logging are tested without crypto, a
network, or a push service.

Decisions worth keeping:
- **Push is optional.** Without a VAPID pair the server boots with push off and
  `GET /api/config` reports a null public key, so the UI hides the feature
  rather than offering a button that cannot work. A *half* configured pair is
  refused at startup, because the symptom otherwise is notifications that
  silently never arrive.
- **The payload carries no terminal output.** It crosses a third-party push
  service, so it says a session wants attention and nothing about what the
  session is doing. There is a test asserting exactly that shape.
- **An expired endpoint (404/410) is deleted, a failure is kept.** The push
  service is a vendor: a permanently dead endpoint must not be retried forever,
  and a transient 502 must not throw away a real device.
- **Every send has a timeout.** `web-push` has none of its own, and a hung
  request would hold a notification open indefinitely.
- **Delivery logs outcome and latency, never the payload.**
- **The permission prompt is only raised from a click.** A browser asked for
  notification permission without a gesture denies it permanently, with no way
  back.
- **Unsubscribe tells the server first**, then the browser. The other order
  leaves the server pushing to an endpoint that no longer exists.
- **Notification click prefers an existing tab** over opening a second one —
  every tab holds its own WebSocket and terminals — and falls back to a URL
  parameter when no tab is open, since a worker cannot postMessage into a page
  that does not exist yet.
- Sessions have no owner in the schema, so a `needs-you` notifies every
  subscribed user. `listSubscribedUserIds` is the seam that has to narrow if
  sessions ever gain an owner.

Verified 14/14 against a real gateway, including a **real encrypted,
VAPID-signed delivery** to a TLS endpoint — the test stands up an HTTPS server
and a genuine P-256 key pair, because `web-push` speaks TLS whatever the
endpoint scheme says, and a placeholder key fails inside the crypto without ever
reaching the network. Both of those were found by this test rather than
reasoned about. 171/171 server, 92/92 web, 25/25 contracts.

Also learned, and now used by the test: an `agent: claude` session launches the
real Claude TUI, so typed text lands in its input box rather than running. The
test overrides the launch command to a plain shell while keeping the agent kind,
which is the per-project launch command feature paying for itself.

Left in phase 3: auto-title, and the output coalescing tiers by visibility.

### 2026-08-12T13:40:00+03:30 · SOLO · 3 · DONE
Auto-title. A session now says what it is doing, and the label is not a guess.

The checklist said "derive a short label from recent output". Every version of
that is a heuristic over the scrollback, and every heuristic is wrong for an
agent TUI, whose output is a redrawn full-screen buffer rather than a
transcript — there is no "last line" that means anything.

There is a real signal instead, and it was already there. A program tells its
terminal what it is doing with OSC 0/2; tmux records that as `pane_title`; and
`display-message -p '#{pane_title}'` reads it out-of-band, with nobody attached
and no escape parsing on the output path. Claude Code publishes a genuine task
summary there — confirmed against the live TUI, which showed
`◑ Count files in directory` about a second into the turn.

So the work split into a thing that reads (`TmuxClient.paneTitle`), a thing that
decides what carries information (`deriveTitle`), and a thing that decides when
to ask (`SessionTitler`).

Decisions worth keeping:
- **The title is read, not guessed.** If an agent ever stops publishing one, the
  feature degrades to "no title" rather than to a confidently wrong one.
- **The liveness glyph is stripped.** Claude alternates ◑ / ◐ / ✳ in front of
  the *same* task. Left in, every turn boundary would emit a title change that
  said nothing, and the sidebar would flicker for no reason.
- **Three things are refused as titles**: the hostname (tmux's default
  `pane_title`, so an untitled session would claim to be called `Bebop`), the
  `user@host:path` a stock shell sets from `PROMPT_COMMAND` (not a task, and the
  UI already shows all of it), and the agent naming itself (`Claude Code`) —
  that last one matters most, because it would replace a real title from the
  previous turn with a constant.
- **Nothing to say never blanks a good title.** `deriveTitle` returns `null`
  rather than an empty string, and `null` means keep what you had.
- **Sampled 2 s after work starts, and again when it settles.** Not a poll: one
  shot, edge-triggered off the activity tracker, cancelled by the next edge, and
  never fired at all for a dead session. Reading on the first byte of output was
  tried and is wrong — the agent has not published the new task yet, so it reads
  the *previous* one and then shows it for the whole run.
- **A slow read cannot overwrite a newer title.** Each sample carries a
  sequence; a result that lands out of order is dropped.
- **Titles are persisted and replayed on subscribe**, for the same reason as
  status: the frames are edge-triggered, so a page load lands between edges and
  would otherwise show nothing until the session's next turn.
- **The titler is separate from the activity tracker.** State is derived
  synchronously from bytes in hand; a title is an async call to a subprocess
  that can fail. Folding them together would put tmux on the path of every
  status frame.
- `ActivityChange` now carries the agent kind, so nothing downstream can pair a
  state with an agent the tracker did not use to derive it.

Verified 6/6 in `server/e2e-title.mjs` against a real gateway, tmux, WebSocket
and database, and then end-to-end against a genuine `claude` session: the
derived title reached a subscribed client and landed in the row.

Also learned, and worth knowing before chasing it as a bug: Claude Code's
welcome screen swallows typed input for the first several seconds. Gateway
input is fine — it lands the moment the welcome clears.

197/197 server, 92/92 web, 25/25 contracts.

Left in phase 3: the output coalescing tiers by visibility.

### 2026-08-12T15:20:00+03:30 · SOLO · 3 · DONE
Output coalescing tiers by visibility, and phase 3 is built.

The `vis` frame has been arriving since phase 1 and the server has been
throwing it away — `case 'vis': return`. Every pane, focused or not, flushed at
16 ms. Now focused is 16 ms, visible 50 ms, hidden 250 ms.

The whole difficulty is what happens to output already buffered at the instant
the tier changes, and the two directions are not symmetric:

- **Becoming more visible flushes immediately.** Someone just focused this pane,
  so what is pooled is exactly what they are waiting to see; holding it for the
  rest of a 250 ms window shows a stale screen at the moment of most attention.
  It also makes rapid switching safe — cancel-and-reschedule would let a pane
  flipped back and forth push its deadline out forever and never deliver. There
  is a test for exactly that starvation case.
- **Becoming less visible leaves the pending timer alone.** It fires early
  against the new tier, costing one extra flush and delaying nothing. Only the
  next window uses the longer interval.

Also: the default is now `visible` (50 ms), not `focused`. A client sends `vis`
right after `sub` but the first bytes can beat it, and guessing `focused` there
starts the quiet majority of panes at the expensive tier.

Visibility is per viewer, not per session — two tabs on one session with only
one focused each get their own cadence, which falls out of the coalescer living
on the subscription.

Verified 4/4 in `server/e2e-visibility.mjs` against a real gateway, PTY and
WebSocket, stable across repeated runs: the same 60-line drip arrives in 62
frames focused and 9 hidden, all 60 lines present at both, and returning to
focused restores 62.

Worth recording, because it nearly produced a false result: **byte totals are
not a usable metric here.** Measured across runs at the same tier they ranged
over 2726, 3503 and 3987 bytes — tmux decides how much cursor positioning and
redraw to emit on its own timing, upstream of our coalescer. A first
measurement in a fresh pane is different again, because it carries the command
echo and the initial redraw. The e2e now discards a warmup run and asserts on
the sixty lines, which is what was actually written and is exact. The earlier
version of this test "failed" for reasons that had nothing to do with the
feature.

205/205 server, 92/92 web, 25/25 contracts.

Phase 3 is built. It is not gated: the exit criterion is a phone in another room
buzzing within five seconds, and that needs the owner and a real device.

Gate table rewritten while here — two columns (Built, Verified) instead of the
Codex/Claude Code split, which recorded a handoff that no longer happens, and
backfilled to reality: phases 0–2 were done and verified but showed blank.

### 2026-08-17T12:24:45+03:30 · SOLO · 3 · DONE
The repository now has one developer, one ownership model, and one resume
state. Codex owns `server/**`, `web/**`, contracts, scripts, and documentation;
the old cross-agent proposal, blocking, and handoff rules are retired.

The project brief, conventions, phase headings, session prompt, README, and
status script now describe the actual solo workflow. `docs/state/backend.md` is
the authoritative resume and `docs/state/frontend.md` is an explicit retired
pointer, so two contradictory current states cannot silently return.

Contract prose was reconciled with the shipped surface: project command
overrides, `GET /api/config`, `PATCH /api/projects/:id`, and the three push
routes now match the TypeScript and server. The architecture security section
also reflects decision #6: the runtime is root, and phase 5 hardening is the
remaining containment boundary.

This changes no application contract or runtime behavior. Phase 3 remains
built but not human-verified; its locked-phone exit test is still the next gate.

### 2026-08-17T12:35:06+03:30 · SOLO · 3 · FIXED
A persisted session can no longer outlive its tmux process while claiming to be
idle. This was the last known hole in the `dead` state: viewer attachments saw
an exit while a browser was connected, but a command that ended with every tab
closed left its database row alive forever.

`SessionLivenessReconciler` now takes one tmux session-name snapshot every five
seconds when persisted sessions exist. Missing rows are registered with the
existing activity tracker and make the same edge-triggered transition to
`dead`, so the normal listener persists the state and subscribed clients receive
the normal status frame. Repeated snapshots emit nothing after the first edge.

The row snapshot deliberately happens before the tmux snapshot. Reversing that
order creates a race where a newly created tmux session can start just after the
snapshot, be inserted before rows are read, and be falsely declared dead.
Transient tmux failures are logged and retried; only tmux's status 1 (no server,
therefore no sessions) is interpreted as an empty snapshot.

Covered by unit tests for missing/live/repeated/empty/failure cases and by
`server/e2e-liveness.mjs`: a real tmux command that exited with no viewer was
marked dead while a second live tmux session was left alone. Full typecheck and
all server, web, and contract unit suites pass.

### 2026-08-17T12:37:05+03:30 · SOLO · 3 · GATE
Phase 3 is shipped. The owner confirmed the physical exit criterion: a locked
subscribed phone received the notification within five seconds of an agent
reaching a permission prompt, and tapping it opened the correct pane focused.

Both Built and Verified are now checked. Phase 4 — worktree isolation, diffs,
and shared-directory collision warnings — is the current phase.

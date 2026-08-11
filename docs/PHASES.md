# Phases

One phase at a time. Nobody starts phase N+1 until both agents have checked
their box in the gate for phase N and the human has replied `SHIP N`.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundations

Nothing runs yet. This phase exists so the seam is defined before any code is
written against it.

**Backend (Codex)**
- [x] pnpm workspace, `server/` package, TS strict, Node 22
- [x] `better-sqlite3` + migration runner, schema for `users`, `projects`, `sessions`, `layouts`
- [x] Fastify boots, `GET /api/health` returns `{ok:true, version}`
- [x] `server/tmux.conf` with `window-size latest`, committed
- [x] Seed script `pnpm seed:user` — argon2id hash + TOTP secret, prints the otpauth URL

**Frontend (Claude Code)**
- [x] `web/` Next.js App Router package, TS strict
- [x] Login page shell (no real auth yet), dark/light, no component library
- [x] Empty workspace shell: sidebar + grid area, renders a placeholder pane
- [x] `pnpm dev` runs both packages

**Shared**
- [x] `packages/contracts` published to the workspace, exporting every type in `docs/CONTRACTS.md`
- [x] Both packages import from `@termspace/contracts` and typecheck clean

**Exit criteria**
`pnpm typecheck` passes at the root. `curl /api/health` returns ok. The web
shell renders. No terminal exists yet and that is correct.

---

## Phase 1 — One terminal, end to end

The only phase with real technical risk. Do not add features to it.

**Backend (Codex)**
- [x] `POST /api/auth/login` — argon2id verify + TOTP, rate limited, sets cookie
- [x] `POST /api/auth/logout`, `GET /api/auth/me`
- [x] `POST /api/ws-ticket` — single-use, 10 s TTL, bound to user
- [x] `GET /ws` — validates ticket + `Origin`, upgrades, multiplexed frames
- [x] `POST /api/sessions` — creates a detached tmux session in a given cwd
- [x] `GET /api/sessions`, `DELETE /api/sessions/:id`
- [x] Attach: `node-pty` running `tmux attach`, per viewer
- [x] Headless `Terminal` per session + `restore` frame on attach
- [x] Output coalescing at 16 ms

**Frontend (Claude Code)**
- [x] Working login with TOTP field, error states, redirect
- [x] `useSocket` — one multiplexed WS for the whole page, ticket fetch,
      exponential backoff reconnect, resubscribe on reopen
- [x] One `xterm.js` pane: `restore` frame applied, input sent, resize sent
- [x] `ResizeObserver` + fit addon, debounced 100 ms
- [x] Visible connection state: connected / reconnecting / dead

**Exit criteria**
Log in from a phone on mobile data. Start `claude` in a session. Kill the Node
process. Restart it. Reconnect. The agent is still running and the screen
restores with correct scrollback and cursor. This is the whole product in
miniature — do not move on until it is true.

---

## Phase 2 — It becomes a workspace

**Backend (Codex)**
- [x] Projects CRUD; `POST /api/projects` accepts an existing path or a git URL to clone
- [x] Sessions belong to a project; `agent` field (`claude` | `codex` | `shell`)
- [x] Launch command per agent type, configurable per project
- [x] `GET /api/layouts` / `PUT /api/layouts` per user

**Frontend (Claude Code)**
- [x] Project sidebar, sessions nested under projects
- [x] Grid layout: 1 / 2 / 2×2 / tabs, switchable, persisted via layouts API
- [x] Hidden panes hold a headless `Terminal` and never call `open()`
- [x] WebGL renderer on the focused pane only, xterm's own renderer elsewhere
      (`@xterm/addon-canvas` has no release for xterm 6 — see PROGRESS 2026-08-11)
- [x] New-session dialog: project + agent picker
- [x] New-project dialog (not originally listed, but without it the app cannot
      be used from a browser at all)
- [x] Delete a session and delete a project, from the sidebar, behind a
      confirmation that states what is actually destroyed. Deleting a project
      leaves its directory on disk; deleting a session kills its tmux session
      and its scrollback with it. The API for both has existed since slice 1
      with nothing calling it, so a project could be created and never removed.

**Exit criteria**
Four sessions across two projects visible at once, layout survives a reload,
switching a hidden pane to visible shows correct up-to-date content instantly.

---

## Phase 3 — It knows what is happening

**Backend (Codex)**
- [x] Activity tracker per session, states per `docs/ARCHITECTURE.md`
- [x] `status` frames pushed on state change only, not on a timer
- [ ] Auto-title: derive a short label from recent output, push as `title` frame
- [x] Web Push subscription endpoints + notify on transition into `needs-you`

**Frontend (Claude Code)**
- [x] Status pill per pane, sidebar dots, document title reflects worst state
- [x] Service worker, push permission flow, notification click focuses the pane
- [ ] Output coalescing tiers by visibility (16 / 50 / 250 ms)

**Exit criteria**
Phone locked in another room buzzes within five seconds of an agent asking a
permission question, and tapping the notification opens that pane focused.

---

## Phase 4 — Parallelism

**Backend (Codex)**
- [ ] `POST /api/sessions` with `worktree: true` creates `git worktree add`
- [ ] `GET /api/sessions/:id/diff` — `git diff` against the base branch
- [ ] `DELETE` removes the worktree, refusing if dirty unless `force`
- [ ] Detect two sessions on the same non-worktree cwd and flag it

**Frontend (Claude Code)**
- [ ] Diff panel per session, file list + unified diff, syntax highlight
- [ ] Worktree toggle in the new-session dialog, branch name field
- [ ] Warning banner when two sessions share a working directory

**Exit criteria**
Two agents on the same repo in separate worktrees, both diffs reviewable
side by side, no file collisions.

---

## Phase 5 — Phone and hardening

**Backend (Codex)**
- [ ] systemd unit + slice with `MemoryMax` per session
      ⚠ The tmux server must get its **own** unit or transient scope. Verified on
      this box: a daemonized tmux server keeps the cgroup of whatever spawned it
      (its parent becomes pid 1, its cgroup does not change). Under one service
      with the default `KillMode=control-group`, `systemctl restart` would kill
      every agent session — breaking non-negotiable #1.
- [ ] Hardening on the unit that owns the shells: `ProtectSystem=strict`,
      `ProtectHome`, `ReadWritePaths=$TERMSPACE_PROJECT_ROOT`, `PrivateTmp`.
      ⚠ Decision #6 runs the app as root so sessions can install packages, which
      makes this unit the only boundary left rather than a second one — and
      `NoNewPrivileges` is now off the list, since it breaks `sudo` inside a
      session. Re-read decision #6 before writing it.
- [ ] Idle session reaper with a configurable grace period
- [ ] SQLite backup on a timer, restore documented
- [ ] Structured request log, no secrets, log rotation

**Frontend (Claude Code)**
- [ ] Responsive: single pane, swipe between sessions
- [ ] Key accessory bar — Esc, Ctrl, Tab, arrows, `/`, `|`
- [ ] Double-press confirm on kill and on destructive keys
- [ ] Reconnect on `visibilitychange` after backgrounding

**Exit criteria**
A full working session driven from a phone, one-handed, including answering a
permission prompt and killing a runaway session.

---

## Gate

Fill this in at the end of each phase. Do not edit another agent's line.

| Phase | Backend (Codex) | Frontend (Claude Code) | Human |
|---|---|---|---|
| 0 | [x] | [x] | [x] |
| 1 | [x] | [x] | [ ] |
| 2 | [ ] | [ ] | [ ] |
| 3 | [ ] | [ ] | [ ] |
| 4 | [ ] | [ ] | [ ] |
| 5 | [ ] | [ ] | [ ] |

# Current state — Termspace (solo)

As of 2026-08-11 this is a solo project: Codex is out and I own `server/**`,
`web/**`, and `packages/contracts/**`. The two-agent ceremony in `CLAUDE.md`
(BLOCKED entries, contract proposals, per-agent gates, `docs/state/backend.md`
being off-limits) no longer applies. The hard technical rules there still do.

Overwritten, never appended. Read it first at every session start.

---

**Phase:** 3, one box left. Phases 0–2 are complete. The UI pass that phase 3
was waiting on is done (commit 9a53621).

**Working on:** nothing in flight. Auto-title just landed; the next box is the
last one in phase 3.

**Done so far in phase 3:**
- Activity tracker + `status` frames on change only (commit 0757b88).
- Web Push, both halves — subscription endpoints, VAPID, and a notification on
  entering `needs-you` that focuses the pane when tapped (commit 0452d6c).
- Status pill per pane, sidebar dots, document title reflecting the worst state.
- **Auto-title.** Titles come from tmux's `pane_title` — what the program in the
  pane told its terminal via OSC 2 — not from guessing at scrollback. Three new
  server files: `activity/title.ts` (what counts as a title),
  `activity/session-titler.ts` (when to ask), and `TmuxClient.paneTitle`.
  Verified 6/6 in `server/e2e-title.mjs` and end-to-end against a real `claude`
  session. See the PROGRESS entry for the reasoning.

**Next concrete step:** the last phase 3 box — output coalescing tiers by
visibility (16 / 50 / 250 ms). The `vis` frame already arrives and is currently
a no-op: `gateway-connection.ts` has `case 'vis': return`. The coalescer is
`server/src/terminal/output-coalescer.ts`, today a single
`createFocusedOutputCoalescer` at a flat 16 ms. The work is to make the interval
a function of the session's visibility level, keep one coalescer per
subscription, and switch its interval when a `vis` frame changes the level —
without dropping buffered output at the moment of the switch. That last part is
the bit to write a test for first.

Then phase 3 is done and phase 4 (worktrees and diffs) opens.

**Landmines:**
- `pnpm` is not on `PATH` (only `corepack pnpm`) and system `node` is v20
  against a `>=22` engine. Use
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` plus a `pnpm` shim
  that execs `corepack pnpm`.
- `node-pty`'s prebuilt binding is for Node 22 (ABI 127) and will not load on
  Node 24. Rebuild with `npm rebuild` inside
  `node_modules/.pnpm/node-pty@1.0.0/node_modules/node-pty`. A `pnpm add` of a
  web-only dependency left it alone, but a full `pnpm install` still undoes it.
- Server tests run **compiled**, not type-stripped: `pnpm test` is
  `tsc && node --test dist/**/*.test.js`. Running `node --test src/x.test.ts`
  directly fails on the `.js` import specifiers. Build first.
- **Do not `pkill -f` a pattern that appears in the command you are typing** —
  it matches the invoking shell and kills the command mid-script. Kill the
  gateway by PID (`ss -ltnp | grep :3001`).
- Port 3000 is taken by another app and **port 3002 is often taken by a
  leftover `next dev`** from an earlier session. A `pnpm build` while that dev
  server is up leaves both with a half-written `.next`, and the symptom is a
  page whose chunks all 404 and whose React never hydrates. Build with
  `TERMSPACE_DIST_DIR=.next-e2e` to keep them apart, and note that `next build`
  rewrites `web/tsconfig.json` to match — revert that file afterwards.
- Whatever port the browser uses must match `TERMSPACE_ALLOWED_ORIGIN` exactly
  or the WS upgrade fails with a bare 403. The gateway reads it once at startup
  and logs it at boot. A 403 is always the Origin; a bad ticket is a 401.
- **Claude Code's welcome screen swallows typed input for the first several
  seconds** of a new session. This is not a gateway bug — input lands normally
  once the welcome clears. It cost a wrong diagnosis once already; don't chase
  it again.
- **State and title only advance while a viewer is subscribed.** `observe()` is
  called from the attachment's `onData`, so with every tab closed nothing is
  derived. Pre-existing for status; auto-title inherits it. If that ever matters,
  it needs a session-lifetime attachment, not a patch to the titler.
- The login form's field ids come from `useId()`. Select by `name`, not `id`.
- `otplib` v13 exports `generate({ secret })`, not `authenticator.generate`.
- Auth sessions are in memory, so a gateway restart forces a re-login. The
  client treats a 401 on the ticket as fatal and goes `dead` deliberately.
- `exactOptionalPropertyTypes` is on: an absent optional and an explicit
  `undefined` are different types. Build inputs with conditional spreads, and in
  tests reset a fake's field through a method — assigning narrows it to `never`.
- `assert.deepEqual(x, [])` / `assert.equal(x, null)` from `node:assert/strict`
  narrow the first argument for the rest of the test, so a later `x.map(...)` is
  a `never` type error. Compare a length or a boolean instead.
- Node's type stripping needs explicit `.ts` extensions on relative imports in
  anything `node --test` runs. Logic that needs testing goes in `web/src/lib/**`,
  not in a `.tsx` — a component's CSS module import cannot be loaded by the
  test runner.
- `TERMSPACE_PROJECT_ROOT` (default `/srv/projects`) must exist and be writable
  by the app user or every project creation fails. Any test that creates a
  project must set this env var to a directory it owns. Locally this lives in
  `server/.env` (loaded by `pnpm start`); a bare `node dist/index.js` bypasses
  it and takes the production defaults.
- `xterm.css` must stay imported in `web/src/app/layout.tsx`. Dropping it does
  not error — the pane just renders blank with a stray textarea in the corner,
  which reads as a backend or socket bug and is not one.
- Containment resolves symlinks (`assertRealPathWithinRoot`). It is still a
  check, not a lock: TOCTOU remains, and only the phase 5 systemd work makes it
  binding. Before writing that unit, read the ⚠ note on phase 5 in
  `docs/PHASES.md` — the tmux server needs its own unit or a restart kills every
  agent session.
- The database is chmod 0600 and a data directory *we create* is 0700. An
  existing directory is deliberately left alone.
- A session row can outlive its tmux session: tmux ends a session when the
  command inside it exits, and nothing reconciles the row with that. The sidebar
  shows it as `idle` and it cannot be attached to. Still unfixed.

**Uncommitted:** nothing.

**Running an e2e locally.** The scripts in `server/*.mjs` need a gateway and a
seeded user. Seed a throwaway one rather than touching the real database:

    printf 'a-password\n' | TERMSPACE_DATABASE_PATH=/tmp/t.db \
      TERMSPACE_PROJECT_ROOT=/tmp/projects node dist/seed/seed-user-cli.js operator
    TERMSPACE_DATABASE_PATH=/tmp/t.db TERMSPACE_PROJECT_ROOT=/tmp/projects \
      TERMSPACE_ALLOWED_ORIGIN=http://localhost:3002 PORT=3001 node dist/index.js &
    DB=/tmp/t.db PASSWORD='a-password' ROOT=/tmp/projects node e2e-title.mjs

They must be run from `server/`, or Node cannot resolve `otplib` and `ws`.
`e2e-ws.mjs` still needs `SECRET`, the operator's TOTP secret.

Nothing in `pnpm test` covers the HTTP+WS+tmux path end to end; the `e2e-*.mjs`
scripts are still worth rewriting into the repo as real integration tests.

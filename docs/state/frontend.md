# Current state — Termspace (solo)

As of 2026-08-11 this is a solo project: Codex is out and I own `server/**`,
`web/**`, and `packages/contracts/**`. The two-agent ceremony in `CLAUDE.md`
(BLOCKED entries, contract proposals, per-agent gates, `docs/state/backend.md`
being off-limits) no longer applies. The hard technical rules there still do.

Overwritten, never appended. Read it first at every session start.

---

**Phase:** 2 — it becomes a workspace. **Every box is ticked and the phase is
gated.** What remains is the exit criteria, which only a human at a browser can
settle. Do not start phase 3.

**Working on:** phase 2 in vertical slices — each feature through the whole
stack before the next, so every slice is usable when it lands.

**Done so far:**
- Phase 1 re-validated from scratch: SIGKILL the gateway, restart, reattach, and
  the scrollback marker plus the backgrounded process survive. Single-use
  tickets, `Origin` rejection, and both frame codecs cross-checked.
- **Slice 1 — projects.** `CreateProjectInput`, `project_not_found`,
  `ProjectRepository` + `ProjectManager` (slug uniqueness, adopt-or-clone,
  refuses to delete a project with sessions), `GET/POST/DELETE /api/projects`,
  sidebar nesting with an "Unknown project" group.
- **Slice 2 — the app is usable from a browser.** `AppConfig` +
  `GET /api/config`, `Dialog` on the native `<dialog>` element, new-project and
  new-session dialogs, empty states that lead somewhere. Committed as 118443e.
- **Slice 3 — layouts and the grid.** `Layout`/`LayoutInput`/`normalizeLayout`
  in contracts; `LayoutRepository` + `GET`/`PUT /api/layouts`; a `PaneStore`
  that owns one terminal per session outside React; `TerminalGrid` +
  `LayoutToolbar` for 1 / 2 / 2×2 / tabs, persisted debounced. Hidden panes hold
  a headless terminal and rehost through a serialized snapshot. Verified 15/15
  against the real gateway on the layouts API.

**Also landed:** creating a project no longer needs a shell. Three sources
instead of two — adopt, clone, or start empty (`createDirectory`) — plus the
server creating its project root at startup and reporting
`projectRootWritable` through `GET /api/config`. This came out of testing: the
default root `/srv/projects` does not exist on a dev box, so every create
failed with advice that would also have failed.

**Also landed:** the three fixes that made terminals work at all (commit
59065ce) — the WebSocket Origin default, the missing `xterm.css` import, and the
absent `terminal.focus()` call. Plus `server/.env` via `--env-file-if-exists`,
so the Origin and project root stop reverting to production defaults on every
restart. And the last phase 2 box: per-agent launch commands, configurable per
project, verified 16/16 against a real gateway and tmux.

**Next concrete step:** the phase 2 exit criteria, by hand in a browser —
nothing else can settle them. `cd server && pnpm start`, `cd web && pnpm dev`,
log in, then check: four panes attach and restore, WebGL lands
only on the focused pane, switching a tab paints the hidden pane's current
screen with no flash of an empty terminal, and a reload comes back with the same
mode, panes, and focus. Then append the phase 2 exit result and only then look
at phase 3.

Also unrun: `server/e2e-ws.mjs` needs `SECRET`, the operator's TOTP secret.
Still missing though no box claims them: deleting a project or a session from
the UI — both APIs exist and nothing calls them.

**Landmines:**
- `pnpm` is not on `PATH` (only `corepack pnpm`) and system `node` is v20
  against a `>=22` engine. Use
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` plus a `pnpm` shim
  that execs `corepack pnpm`.
- `node-pty`'s prebuilt binding is for Node 22 (ABI 127) and will not load on
  Node 24. Rebuild with `npm rebuild` inside
  `node_modules/.pnpm/node-pty@1.0.0/node_modules/node-pty`. A `pnpm add` of a
  web-only dependency left it alone, but a full `pnpm install` still undoes it.
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
  and logs it at boot. The default assumes `web` is on 3002 — if you start it on
  any other port (`PORT=3003 pnpm dev`), set `TERMSPACE_ALLOWED_ORIGIN` to match
  or you are back in the same hole. A 403 is always the Origin; a bad ticket is
  a 401.
- The login form's field ids come from `useId()`. Select by `name`, not `id`.
- `otplib` v13 exports `generate({ secret })`, not `authenticator.generate`.
- Auth sessions are in memory, so a gateway restart forces a re-login. The
  client treats a 401 on the ticket as fatal and goes `dead` deliberately.
- `exactOptionalPropertyTypes` is on: an absent optional and an explicit
  `undefined` are different types. Build inputs with conditional spreads, and in
  tests reset a fake's field through a method — assigning narrows it to `never`.
- `assert.equal` from `node:assert/strict` narrows its first argument for the
  rest of the test. `assert.equal(x.field, null)` then calling `x.field?.()`
  later is a `never` type error; compare a boolean instead.
- Node's type stripping needs explicit `.ts` extensions on relative imports in
  anything `node --test` runs. Logic that needs testing goes in `web/src/lib/**`,
  not in a `.tsx` — a component's CSS module import cannot be loaded by the
  test runner. This is why `PaneStore` takes an injected terminal factory and
  the real `xterm` adapter lives in a file no test imports.
- `TERMSPACE_PROJECT_ROOT` (default `/srv/projects`) must exist and be writable
  by the app user or every project creation fails. Any test that creates a
  project must set this env var to a directory it owns. Locally this now lives
  in `server/.env` (loaded by `pnpm start`); a bare `node dist/index.js` still
  bypasses it and takes the production defaults.
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

**Uncommitted:** nothing. Validation scripts live in the
session scratchpad and are **not** in the repo: `e2e-layouts.mjs` (the 15 checks
above), `e2e-setup.mjs` (seeds two projects and four sessions over the API), and
`e2e-newproject.mjs` (10 checks on project creation from nothing), and an
abandoned `e2e-grid.mjs` that drives headless Chrome over CDP and gets as far as
the login form. Nothing in `pnpm test` covers the HTTP+WS+tmux path end to
end; those scripts are still worth rewriting into the repo as real integration
tests.

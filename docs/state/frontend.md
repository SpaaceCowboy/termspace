# Current state — Termspace (solo)

As of 2026-08-11 this is a solo project: Codex is out and I own `server/**`,
`web/**`, and `packages/contracts/**`. The two-agent ceremony in `CLAUDE.md`
(BLOCKED entries, contract proposals, per-agent gates, `docs/state/backend.md`
being off-limits) no longer applies. The hard technical rules there still do.

Overwritten, never appended. Read it first at every session start.

---

**Phase:** 2 — it becomes a workspace. Slices 1 and 2 of 3 landed.

**Working on:** phase 2 in vertical slices — each feature through the whole
stack before the next, so every slice is usable when it lands.

**Done so far:**
- Phase 1 re-validated from scratch, not taken on trust. Typecheck clean, tests
  green, and the exit criterion driven for real: SIGKILL the gateway, restart,
  reattach, and the scrollback marker plus the backgrounded process survive.
  Also verified single-use tickets, `Origin` rejection, and that a rejected
  foreign-origin upgrade does not burn the ticket.
- The two frame codecs were cross-checked against each other in both
  directions, including a UTF-8 char split across two binary frames.
- **Slice 1 — projects.** `CreateProjectInput` and `project_not_found` in
  contracts; `ProjectRepository` + `ProjectManager` (slug uniqueness, path
  normalization, adopt-or-clone, refuses to delete a project with sessions);
  `GET/POST/DELETE /api/projects`; data layer `createProject`/`deleteProject` on
  both fixture and http sources; sidebar nests sessions under their projects
  with an "Unknown project" group so an orphaned session is never unreachable.
  Validated against the real gateway including a real `git clone`.

- **Slice 2 — the app is usable from a browser.** `AppConfig` + `GET /api/config`
  so the new-project form knows the project root; `Dialog` on the native
  `<dialog>` element; `NewProjectDialog` and `NewSessionDialog`; empty states
  that lead somewhere. Verified cold from an empty database all the way to a
  live shell — no curl, no SQL.

**Next concrete step:** slice 3 — layouts and the grid. It needs a `Layout`
contract type, which does not exist yet, so design that first: it has to carry
the mode (1 / 2 / 2×2 / tabs) and which session sits in which slot. Then
`GET`/`PUT /api/layouts` (the `layouts` table already exists, keyed by user with
a `json_valid` CHECK), then the grid itself with hidden panes holding a headless
`Terminal` that never calls `open()` and WebGL only on the focused pane.
Deleting a project or session from the UI is still missing — the API supports
both, nothing calls it.

**Landmines:**
- `pnpm` is not on `PATH` (only `corepack pnpm`) and system `node` is v20
  against a `>=22` engine. Use
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` plus a `pnpm` shim
  that execs `corepack pnpm`.
- `node-pty`'s prebuilt binding is for Node 22 (ABI 127) and will not load on
  Node 24. Rebuild with `npm rebuild` inside
  `node_modules/.pnpm/node-pty@1.0.0/node_modules/node-pty`. **Any `pnpm install`
  undoes this** and the gateway then refuses to boot.
- When killing test gateways, match on `termspace/server/dist/index.js`. A bare
  `pkill -f dist/index.js` also matches the invoking shell. An orphaned gateway
  answers health checks against a deleted database and silently invalidates a
  test run.
- Port 3000 is taken by another app; web defaults to 3002. Whatever port the
  browser uses must match `TERMSPACE_ALLOWED_ORIGIN` or the WS upgrade fails.
- Auth sessions are in memory, so a gateway restart forces a re-login. The
  client treats a 401 on the ticket as fatal and goes `dead` deliberately.
- `exactOptionalPropertyTypes` is on: an absent optional and an explicit
  `undefined` are different types. Build inputs with conditional spreads, and in
  tests reset a fake's field through a method — assigning narrows it to `never`.
- Node's type stripping needs explicit `.ts` extensions on relative imports in
  anything `node --test` runs. Logic that needs testing goes in `web/src/lib/**`,
  not in a `.tsx` — a component's CSS module import cannot be loaded by the
  test runner.
- `TERMSPACE_PROJECT_ROOT` (default `/srv/projects`) must exist and be writable
  by the app user or every project creation fails. Project paths are confined to
  it, and a session `cwd` is confined to its own project — see decision #5. Any
  test that creates a project must set this env var to a directory it owns.
- Containment resolves symlinks (`assertRealPathWithinRoot`). It is still a
  check, not a lock: TOCTOU remains, and only the phase 5 systemd work makes it
  binding. Before writing that unit, read the ⚠ note on phase 5 in
  `docs/PHASES.md` — the tmux server needs its own unit or a restart kills every
  agent session.
- The database is chmod 0600 and a data directory *we create* is 0700. An
  existing directory is deliberately left alone.

**Uncommitted:** everything in slices 1 and 2 above. Validation scripts live in
the session scratchpad and are **not** in the repo — `e2e.mjs` (phase 1 exit
criteria), `e2e-projects.mjs` (projects CRUD, containment, symlink escapes),
`e2e-flow.mjs` (cold start to a live shell), `seam.mjs` (the two frame codecs
against each other). They are worth rewriting into the repo as real integration
tests; nothing in `pnpm test` covers the HTTP+WS+tmux path end to end.

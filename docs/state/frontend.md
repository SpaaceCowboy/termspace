# Current state — frontend (Claude Code)

Overwritten, never appended. This is "where was I", not history — history lives
in `docs/PROGRESS.md`.

Rewrite this file every time you stop working: at the end of a session, when
you finish a task, when you switch tasks, and especially when you are running
low on context. Read it first at every session start, before `PROGRESS.md`.

If it says you were mid-task, resume from `Next concrete step`. Do not restart
the task and do not rewrite what is already there.

---

**Phase:** 1 — frontend gate ticked, waiting on the human for `SHIP 1`
**Working on:** nothing in flight. All five phase 1 frontend boxes are done.
**Done so far:** frame codec (`web/src/lib/socket/frame-codec.ts`), backoff,
  `GatewayClient` + `useSocket`, live `TerminalPane`, working login with
  per-`ErrorCode` messages and redirect, connection badge, auth guard on
  `/workspace`. Data layer extended to the full phase 1 HTTP surface and now
  defaults to the real backend. Next proxies `/api/*` and `/ws` in dev.
  Verified live end to end against Codex's gateway, including the exit criteria
  restart test. Tests: contracts 12, web 33, server 80. Typecheck and build clean.
**Next concrete step:** do not start phase 2 until the human says `SHIP 1`.
  When they do, the first box is the project sidebar with sessions nested under
  projects, which needs `GET /api/projects` — a phase 2 backend box that does not
  exist yet, so build it against `fixtureSource.listProjects()` and flip over
  when Codex lands it. Before that, read `docs/PROGRESS.md` for the phase 2
  `Layout` contract: it is still undefined and both the grid-layout box and the
  layouts API depend on it, so propose it early rather than mid-task.
**Landmines:**
- `pnpm` is not on `PATH` (only `corepack pnpm`) and system `node` is v20.19.2
  against a `>=22` engine. Use
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` plus a `pnpm` shim
  that execs `corepack pnpm`, or root scripts die with `pnpm: not found`.
- `node-pty`'s prebuilt binding is compiled for Node 22 (ABI 127) and will not
  load on Node 24 (ABI 137). I rebuilt it in place with `npm rebuild` inside
  `node_modules/.pnpm/node-pty@1.0.0/node_modules/node-pty`. A fresh
  `pnpm install` will undo that and the gateway will refuse to boot.
- Port 3000 is taken by an unrelated app on this box. Use `PORT=3100 pnpm dev`,
  and start the gateway with `TERMSPACE_ALLOWED_ORIGIN=http://localhost:3100`
  or the WebSocket upgrade is rejected.
- Auth sessions are in memory server-side, so a gateway restart invalidates the
  cookie. The client treats a 401 on the ticket as fatal and goes `dead` rather
  than retrying forever; that is deliberate, not a bug.
- Node's type stripping needs explicit `.ts` extensions on relative imports in
  anything `node --test` executes. `web/src/lib/**` uses them; components do not
  because only the bundler loads those.
- Creating a session needs a row in `projects`; there is no projects API until
  phase 2, so any manual test has to insert one directly.
- `docs/CONTRACTS.md` has the literal string `` `## Settled` `` in its rules
  prose. Anchor scripts on a full-line match or you will corrupt the file.
- Compose CSS module class names with `cx()`; they are typed `string | undefined`.
**Uncommitted:** none.

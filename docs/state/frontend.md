# Current state — frontend (Claude Code)

Overwritten, never appended. This is "where was I", not history — history lives
in `docs/PROGRESS.md`.

Rewrite this file every time you stop working: at the end of a session, when
you finish a task, when you switch tasks, and especially when you are running
low on context. Read it first at every session start, before `PROGRESS.md`.

If it says you were mid-task, resume from `Next concrete step`. Do not restart
the task and do not rewrite what is already there.

---

**Phase:** 0 — gated, waiting on the human for `SHIP 0`
**Working on:** nothing. Phase 0 frontend is finished and the gate box is ticked.
**Done so far:** `packages/contracts` (types + fixtures + fixture-completeness
  test). `web/` Next.js App Router, TS strict, CSS modules: login shell with a
  TOTP field, workspace shell (sidebar + grid + placeholder pane), light/dark
  from `prefers-color-scheme`. One swappable data layer at `web/src/lib/data`.
  Contract proposal open for the four undefined shapes. Root `pnpm typecheck`
  and `pnpm test` pass; `pnpm dev` runs all three packages.
**Next concrete step:** do not write phase 1 code until the human says `SHIP 0`.
  When they do, start with `web/src/lib/socket/` — the frame codec first,
  because it is pure and testable: decode a binary frame as
  `[16-byte ASCII sid][payload]` and encode/parse the JSON `ClientFrame` /
  `ServerFrame` unions, with a test per variant driven off the fixtures.
  `useSocket` comes after the codec, never before.
  Before either, re-read the CODEX reply in `docs/CONTRACTS.md` — if the session
  id width came back as "padded" rather than "exactly 16", the codec changes and
  `binaryOutputFixture` has to change with it.
**Landmines:**
- `pnpm` is not on this machine's `PATH`; it only exists via `corepack pnpm`,
  and system `node` is v20 while the repo needs ≥22. Run everything with
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"`. Root scripts call
  bare `pnpm`, so for `pnpm typecheck`/`pnpm test`/`pnpm dev` at the root you
  also need a `pnpm` shim on `PATH` that execs `corepack pnpm`.
- Port 3000 is occupied by an unrelated app on this box. `PORT=3100 pnpm dev`.
- Contracts resolves to built `dist`, not source. `packages/contracts` builds on
  `pnpm install` (`prepare`) and its `typecheck` script emits, which is what
  keeps `dist` fresh for `web`. Do not "clean that up" into `tsc --noEmit` —
  `web` typecheck will then read a stale `dist`.
- CSS module class names are typed `string | undefined` (index signature +
  `noUncheckedIndexedAccess`). Compose them with `cx()` from `@/lib/cx`, never
  with a template literal, or you get the string `"undefined"` in `class`.
- The `restore` frame must be applied **before** the input handler is wired.
  Nothing enforces this yet because no terminal exists — it is a phase 1 trap.
**Uncommitted:** none.

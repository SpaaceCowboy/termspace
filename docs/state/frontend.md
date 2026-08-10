# Current state — frontend (Claude Code)

Overwritten, never appended. This is "where was I", not history — history lives
in `docs/PROGRESS.md`.

Rewrite this file every time you stop working: at the end of a session, when
you finish a task, when you switch tasks, and especially when you are running
low on context. Read it first at every session start, before `PROGRESS.md`.

If it says you were mid-task, resume from `Next concrete step`. Do not restart
the task and do not rewrite what is already there.

---

**Phase:** 1
**Working on:** nothing in flight. The agreed contract is implemented and
  committed (`d083047`); phase 1 UI work has not started and is waiting on the
  human's go.
**Done so far:** phase 0 shipped (all three gate boxes). Implemented the settled
  proposal: `ErrorCode` + `isErrorCode` (`errors.ts`), `User`/`LoginInput`/
  `WsTicket` (`auth.ts`), `CreateSessionInput` (`core.ts`), fixtures and tests
  for each; proposal block moved to `## Settled`. This cleared Codex's 16:41
  BLOCKED entry. Root typecheck passes; tests: contracts 12, web 2, server 71.
**Next concrete step:** on go, create `web/src/lib/socket/frame-codec.ts` —
  decode binary frames as a fixed 16-byte ASCII sid slice plus payload, and
  parse/serialise the JSON `ClientFrame`/`ServerFrame` unions with zod, one test
  per variant driven off the contracts fixtures. Codec before `useSocket`,
  `useSocket` before any terminal. Read `server/src/ws/frame-codec.ts` first and
  match it exactly — Codex has already shipped the encoder this must mirror.
**Landmines:**
- `pnpm` is not on `PATH` here (only `corepack pnpm`) and system `node` is
  v20.19.2 against a `>=22` engine. Run:
  `export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"` plus a `pnpm` shim
  that execs `corepack pnpm`, or every root script dies with `pnpm: not found`.
  Codex hit this too.
- Port 3000 is taken by an unrelated app on this box. Use `PORT=3100 pnpm dev`.
- `docs/CONTRACTS.md` contains the literal string `` `## Settled` `` inside the
  rules prose at the top. Anchoring a script on `## Settled` matches that first
  and corrupts the file. Match on a full line (`l == '## Settled'`).
- Contracts resolves to built `dist`. Its `typecheck` script emits on purpose,
  which is what keeps `dist` fresh for `web`. Do not "fix" it to `--noEmit`.
- Compose CSS module class names with `cx()` from `@/lib/cx`, never a template
  literal — they are typed `string | undefined`.
- Apply the `restore` frame **before** wiring `onData`, or the first keystrokes
  land in a stale buffer. Nothing enforces this yet.
- Codex pinned `node-pty` at 1.0.0; 1.1.0 segfaults on exit.
**Uncommitted:** none.

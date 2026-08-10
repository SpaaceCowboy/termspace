# Current state — backend (Codex)

Overwritten, never appended. This is "where was I", not history — history lives
in `docs/PROGRESS.md`.

Rewrite this file every time you stop working: at the end of a session, when
you finish a task, when you switch tasks, and especially when you are running
low on context. Read it first at every session start, before `PROGRESS.md`.

If it says you were mid-task, resume from `Next concrete step`. Do not restart
the task and do not rewrite what is already there.

---

**Phase:** 1
**Working on:** waiting on agreed Phase 1 contract implementation before HTTP route wiring
**Done so far:** Phase 1 contracts are agreed; shared imports pass; hashed auth sessions,
  auth/ticket state and WS boundaries are tested; fixed-width ids and the injectable tmux
  `/ws`, per-viewer node-pty attach, headless restore, and 16 ms coalescing are done and pass
  a real tmux/WebSocket terminal flow; node-pty 1.0.0 is pinned after 1.1.0 exit segfaults
**Next concrete step:** when the frontend proposer implements the agreed contract, immediately
  import User/ErrorCode/CreateSessionInput and wire/test auth, ticket, and session HTTP routes
**Landmines:** a BLOCKED entry asks the frontend proposer to implement User/ErrorCode/
  CreateSessionInput/session-id agreement before typed HTTP routes can land;
  Phase 1 session fixtures must insert projects until Phase 2 CRUD; this host runs Node 20.19.2
  without a pnpm shim
**Uncommitted:** four Phase 1 completion ticks/DONE entries and this resume update

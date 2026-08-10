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
**Working on:** gated after completing every Phase 1 backend checklist item
**Done so far:** login/logout/me, 10-second user-bound tickets, authenticated session CRUD,
  exact-Origin ticketed `/ws`, real per-viewer tmux PTYs, headless restore, and 16 ms output
  coalescing are implemented and tested; a live API flow passed against real tmux
**Next concrete step:** wait for the Phase 1 frontend gate and human `SHIP 1`; do not begin
  Phase 2 before both arrive
**Landmines:** this host defaults to unsupported Node 20.19.2 and has no pnpm shim; use a
  Node 22 runtime for native argon2/SQLite/node-pty tests; node-pty 1.0.0 is pinned because
  1.1.0 segfaulted on clean exit
**Uncommitted:** none

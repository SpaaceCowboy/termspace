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
**Working on:** Phase 1 runtime configuration and dependency composition
**Done so far:** Phase 1 contracts are agreed; shared imports pass; hashed auth sessions,
  auth/ticket state and WS boundaries are tested; fixed-width ids and the injectable tmux
  connection hub passes; WebSocket upgrades validate exact Origin before consuming a single-use
  ticket, ignore cookies, sequence text frames, and reject binary client frames
**Next concrete step:** commit upgrade handling, validate production Origin/auth TTL env, and
  compose database, auth/ticket stores, tmux, PTY, buffers, gateway, and lifecycle cleanup
**Landmines:** the frontend proposer must implement User/ErrorCode before auth can import them;
  Phase 1 session fixtures must insert projects until Phase 2 CRUD; this host runs Node 20.19.2
  without a pnpm shim
**Uncommitted:** WebSocket upgrade/auth code/tests, ws typings/lockfile, progress, state

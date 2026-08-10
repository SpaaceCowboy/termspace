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
**Working on:** valid-ticket live WebSocket upgrade and ping verification
**Done so far:** Phase 1 contracts are agreed; shared imports pass; hashed auth sessions,
  auth/ticket state and WS boundaries are tested; fixed-width ids and the injectable tmux
  runtime composition passes live health and foreign-Origin checks; node-pty is pinned to 1.0.0
  because 1.1.0 reproducibly segfaults on clean Node 22 exit
**Next concrete step:** commit runtime composition, then issue a ticket through runtime services
  and verify a real same-Origin WebSocket upgrade and multiplexed ping/pong before route work
**Landmines:** a BLOCKED entry asks the frontend proposer to implement User/ErrorCode/
  CreateSessionInput/session-id agreement before typed HTTP routes can land;
  Phase 1 session fixtures must insert projects until Phase 2 CRUD; this host runs Node 20.19.2
  without a pnpm shim
**Uncommitted:** runtime/env/index code, node-pty exact pin/lockfile, progress, state

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
**Working on:** detached tmux session lifecycle behind a testable interface
**Done so far:** Phase 1 contracts are agreed; shared imports pass; hashed auth sessions,
  login throttling, ticket state, frame codecs, and Origin validation are implemented and tested
**Next concrete step:** commit the WebSocket boundary codecs, then implement 16-byte session-id
  generation and detached tmux create/list/delete behavior behind an injectable command runner
**Landmines:** the frontend proposer must implement User/ErrorCode before auth can import them;
  Phase 1 session fixtures must insert projects until Phase 2 CRUD; this host runs Node 20.19.2
  without a pnpm shim
**Uncommitted:** frame/origin codecs and tests, progress, state

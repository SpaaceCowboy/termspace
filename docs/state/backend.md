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
**Working on:** Phase 1 login endpoint and server-side auth sessions
**Done so far:** Phase 1 contracts are agreed; server now consumes the contracts package;
  the final shared Phase 0 box passes root typechecking
**Next concrete step:** commit the contracts integration, inspect the implemented contract
  proposal state, then build and test rate-limited password/TOTP login with secure cookies
**Landmines:** the frontend proposer must implement User/ErrorCode before auth can import them;
  Phase 1 session fixtures must insert projects until Phase 2 CRUD; this host runs Node 20.19.2
  without a pnpm shim
**Uncommitted:** server contracts dependency/import, lockfile, shared checkbox, progress, state

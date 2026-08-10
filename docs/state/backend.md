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
**Working on:** server integration with `@termspace/contracts`
**Done so far:** Phase 0 is shipped; Codex agreed to the complete Phase 1 contract proposal
**Next concrete step:** commit the agreement, add the workspace contracts dependency,
  import shared response/domain types in server code and tests, then run root verification
**Landmines:** the frontend proposer must implement the newly agreed shapes before auth can
  import User/ErrorCode; Phase 1 session fixtures must insert projects until Phase 2 CRUD;
  this host runs Node 20.19.2 without a pnpm shim
**Uncommitted:** contract agreement, CONTRACT progress entry, and this resume update

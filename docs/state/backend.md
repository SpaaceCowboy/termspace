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
**Working on:** Phase 1 plan prepared; waiting for the human to say `go`
**Done so far:** Phase 0 is shipped and all nine Phase 1 backend boxes have been reviewed
**Next concrete step:** after `go`, agree or counter the open Phase 1 contract proposal,
  add the required server contracts dependency/import, then implement the auth endpoints
**Landmines:** the contract proposal for ErrorCode, User, CreateSessionInput, and 16-byte
  session ids is open; this host runs Node 20.19.2 without a pnpm shim; `web/package.json`
  has an unrelated uncommitted frontend change that must remain untouched
**Uncommitted:** none

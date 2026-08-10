# Current state — backend (Codex)

Overwritten, never appended. This is "where was I", not history — history lives
in `docs/PROGRESS.md`.

Rewrite this file every time you stop working: at the end of a session, when
you finish a task, when you switch tasks, and especially when you are running
low on context. Read it first at every session start, before `PROGRESS.md`.

If it says you were mid-task, resume from `Next concrete step`. Do not restart
the task and do not rewrite what is already there.

---

**Phase:** 0
**Working on:** Fastify bootstrap and the Phase 0 health endpoint
**Done so far:** workspace/server foundation and transactional SQLite schema are
  implemented, tested under Node 22, logged, and committed through the foundation unit
**Next concrete step:** add Fastify, build an injectable app with the health route,
  test the response envelope, and add the production listener entrypoint
**Landmines:** this host runs Node 20.19.2 and has no pnpm shim; use
  `corepack pnpm` locally while keeping Node >=22 as the package engine
**Uncommitted:** database/config implementation, tests, lockfile, checkbox, and progress entry

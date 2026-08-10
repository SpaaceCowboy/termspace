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
**Working on:** Phase 0 backend gate verification
**Done so far:** workspace/server foundation, SQLite migrations, and the Fastify
  health server, tmux configuration, and seeded-user CLI are implemented and verified
**Next concrete step:** run the root typecheck and test suites under Node 22, recheck
  the live health route, then append the Phase 0 GATE entry and tick only the backend gate
**Landmines:** this host runs Node 20.19.2 and has no pnpm shim; use
  `corepack pnpm` locally while keeping Node >=22 as the package engine
**Uncommitted:** seed CLI/core/parser/tests, package metadata, lockfile, checkbox, and progress entry

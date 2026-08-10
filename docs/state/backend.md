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
**Working on:** gated after Phase 0 backend completion
**Done so far:** workspace/server foundation, SQLite migrations, and the Fastify
  health server, tmux configuration, and seeded-user CLI are implemented, tested,
  committed, and the backend Phase 0 gate is ready to commit
**Next concrete step:** wait for the frontend and shared Phase 0 work plus human `SHIP 0`;
  after that signal, reread coordination docs before taking the first Phase 1 backend item
**Landmines:** this host runs Node 20.19.2 and has no pnpm shim; use
  `corepack pnpm` locally while keeping Node >=22 as the package engine
**Uncommitted:** backend Phase 0 gate checkbox, GATE entry, and this resume update

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
**Working on:** tmux baseline configuration
**Done so far:** workspace/server foundation, SQLite migrations, and the Fastify
  health server are implemented and verified under Node 22, including a live curl
**Next concrete step:** add `server/tmux.conf` with latest-client window sizing and
  verify tmux accepts the file on this machine
**Landmines:** this host runs Node 20.19.2 and has no pnpm shim; use
  `corepack pnpm` locally while keeping Node >=22 as the package engine
**Uncommitted:** Fastify app/listener/test, dependency lockfile, checkbox, and progress entry

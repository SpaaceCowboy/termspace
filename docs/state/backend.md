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
**Working on:** SQLite migration runner and the Phase 0 database schema
**Done so far:** pnpm workspace and strict Node 22 server package are implemented,
  typechecked, logged, and ready to commit
**Next concrete step:** add better-sqlite3, validate database configuration, and
  implement and test ordered migrations for users, projects, sessions, and layouts
**Landmines:** this host runs Node 20.19.2 and has no pnpm shim; use
  `corepack pnpm` locally while keeping Node >=22 as the package engine
**Uncommitted:** workspace/server scaffold, lockfile, Phase 0 checkbox, and progress entry

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
**Working on:** seeded-user CLI
**Done so far:** workspace/server foundation, SQLite migrations, and the Fastify
  health server and tmux latest-window configuration are implemented and verified
**Next concrete step:** add argon2 and otplib, implement the validated `seed:user`
  CLI, and test hashing, TOTP secret generation, database persistence, and output
**Landmines:** this host runs Node 20.19.2 and has no pnpm shim; use
  `corepack pnpm` locally while keeping Node >=22 as the package engine
**Uncommitted:** tmux config, checkbox, and progress entry

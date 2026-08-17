# Current state — Termspace (solo)

**Phase:** 4 — Parallelism. Phases 0–3 are built and human-verified.

**Working on:** the additive Phase 4 contract for worktree session creation, diff review,
dirty worktree deletion, and same-directory collision signaling across server and web.

**Done so far:** 43 of 59 checklist items are complete. Phase 3's real locked-phone Web Push
criterion passed: delivery arrived within five seconds and tapping focused the correct pane.
Dead tmux rows also reconcile automatically, and the whole existing suite is green.

**Next concrete step:** inspect the current database migrations, project/session repositories,
HTTP parsers, frontend data schemas, and new-session/delete flows; then add tested Phase 4 types
and fixtures without changing the meaning of existing requests.

**Landmines:** system Node is 20 although the project requires 22+, and global pnpm is 11 while
the project pins 10.15; validate with an explicit compatible toolchain. Worktree paths must stay
under the project root but outside the repository's tracked tree, branch/path creation must roll
back atomically, dirty deletion must never lose work without explicit `force`, and diffs need
bounded output so a large repository cannot exhaust the gateway or browser.

**Uncommitted:** none after the Phase 3 gate record is committed.

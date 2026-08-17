# Current state — Termspace (solo)

**Phase:** 4 — Parallelism. Phases 0–3 are built and human-verified; five of seven Phase 4
checklist items are complete.

**Working on:** `GET /api/sessions/:id/diff` and the session diff-review panel.

**Done so far:** worktree create, rollback, dirty/forced delete, the new-session worktree and
branch controls, derived same-cwd conflict flags, and the sidebar warning are implemented.
Worktree storage is reserved and contained. Full typecheck/unit suites, a Next production build,
and 5/5 checks against real Git and tmux pass.

**Next concrete step:** implement a bounded Git diff reader that compares a session cwd with its
project default branch, parses name-status/numstat plus untracked files, and returns the shared
`DiffResult`; then expose the authenticated route and build the file-list/unified-patch panel.

**Landmines:** system Node is 20 and global pnpm is 11, so use the explicit compatible toolchain.
Diff generation must include staged and unstaged tracked changes plus list untracked files,
preserve rename paths, bound subprocess output without presenting partial data as complete, and
never allow a path argument to become a Git revision or option. Worktree branches are preserved
on normal/forced session deletion by design.

**Uncommitted:** none after the worktree/collision slice is committed.

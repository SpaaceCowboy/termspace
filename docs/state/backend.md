# Current state — Termspace (solo)

**Phase:** 4 — Parallelism is built; Phases 0–3 are built and human-verified. Phase 4 is gated on
the owner's real two-agent worktree exit test, so Phase 5 must not start yet.

**Working on:** Phase 4 gate only. Diff review now diagnoses non-Git directories separately from
missing base branches; this gate-setup repair is committed.

**Done so far:** all seven Phase 4 boxes are implemented across server and web: contained
worktree lifecycle, dirty/forced deletion, same-cwd warnings, bounded default-branch diffs, and
simultaneous side-by-side reviews for two visible sessions. All unit suites, typechecks,
production builds, 7/7 real Git diff checks, 5/5 real Git/tmux worktree checks, and a headless
Chrome visual interaction pass.
Stale standard sessions whose tmux target and cwd are already absent can now be deleted cleanly;
the real-tmux regression passes 3/3 and the full package test/typecheck suites remain green.
Diff preflights now distinguish `not_repository`, `base_missing`, and later Git failures without
changing the HTTP status or error code; the real Git diff integration remains 7/7.

**Next concrete step:** ask the owner to run two agent sessions from the same project in separate
worktrees, make a distinct change in each, open the 2-pane layout and Review changes, and confirm
both reviews are visible side by side with no file collision. On confirmation, check Phase 4
Verified, append a GATE entry, and begin the first unchecked Phase 5 server item.

**Landmines:** system Node is 20 and global pnpm is 11, so use the explicit Node 24/pnpm 10
toolchain. Diff patch output is deliberately capped at 1 MiB, metadata at 512 KiB per Git call,
and files at 2,000; `truncated` must remain visible. Untracked contents are listed but never copied
into the patch. Worktree branches and commits are preserved on normal and forced session deletion.
Projects remain deliberately non-cascading: delete their sessions first, then the project record.
Review changes requires a real Git repository with a commit at the configured default branch; an
ordinary directory has no objective baseline and must never be initialized or committed silently.

**Uncommitted:** none. The reason-specific diff diagnosis repair is committed at `b826d65`.

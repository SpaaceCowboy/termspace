# Current state — Termspace (solo)

**Phase:** 5 — Phone and hardening. Phases 0–4 are built and human-verified.

**Working on:** gated after completing all five Phase 5 server boxes. The Phase 5 web checklist
and phone exit criterion remain; phase discipline forbids starting Phase 6.

**Done so far:** all seven Phase 4 boxes are implemented across server and web: contained
worktree lifecycle, dirty/forced deletion, same-cwd warnings, bounded default-branch diffs, and
simultaneous side-by-side reviews for two visible sessions. All unit suites, typechecks,
production builds, 7/7 real Git diff checks, 5/5 real Git/tmux worktree checks, and a headless
Chrome visual interaction pass.
Stale standard sessions whose tmux target and cwd are already absent can now be deleted cleanly;
the real-tmux regression passes 3/3 and the full package test/typecheck suites remain green.
Diff preflights now distinguish `not_repository`, `base_missing`, and later Git failures without
changing the HTTP status or error code; the real Git diff integration remains 7/7.
The owner confirmed the two-worktree, side-by-side review exit criterion; Phase 4 is verified.
The systemd ownership box is complete: foreground named tmux service, separate disposable gateway,
per-session transient scopes with MemoryMax, verified 9/9 against real systemd/tmux/gateway.
The shell-owning tmux namespace, gateway, and web units now apply the planned filesystem/private
tmp directives; the expanded real hardening/restart integration passes 12/12.
The idle reaper selects only continuously idle rows older than its bounded grace, rechecks every
candidate, and uses non-force SessionManager cleanup; unit/workspace checks and 4/4 real tmux
checks pass.
SQLite backup uses the live-safe online API, verifies and atomically publishes mode-0600 files,
retains a configurable count, and has a 6/6 disposable restore check plus verified systemd units.
Structured request logging emits one bounded record, redacts or omits every credential/body/query
surface, safely classifies errors, and writes to an isolated, size/time-bounded journal namespace.

**Next concrete step:** after the Phase 5 web boxes are complete, run the phone exit criterion and
record owner verification. Do not start Phase 6 before that gate opens.

**Landmines:** system Node is 20 and global pnpm is 11, so use the explicit Node 24/pnpm 10
toolchain. Diff patch output is deliberately capped at 1 MiB, metadata at 512 KiB per Git call,
and files at 2,000; `truncated` must remain visible. Untracked contents are listed but never copied
into the patch. Worktree branches and commits are preserved on normal and forced session deletion.
Projects remain deliberately non-cascading: delete their sessions first, then the project record.
Review changes requires a real Git repository with a commit at the configured default branch; an
ordinary directory has no objective baseline and must never be initialized or committed silently.
The tmux server inherits the cgroup that launches it even after daemonizing; never launch the first
tmux server from the gateway service unless it is moved into its own systemd ownership first.
Transient session scopes inherit many properties from their slice but not service sandbox settings;
verify every hardening directive on the actual agent process, not merely on gateway or tmux.
The tmux namespace has broad package-manager write exceptions by owner decision; systemd-analyze's
high exposure score is expected and must not be described as strong containment.

**Uncommitted:** none. Structured logging and the Phase 5 backend gate landed in `e7799cb`.

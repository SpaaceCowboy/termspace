# Current state — Termspace (solo)

**Phase:** 3 is built but not verified; phases 0–2 are built and human-verified.

**Working on:** the Phase 3 locked-phone Web Push exit gate. The repository has been
reconciled for Codex as the sole developer across server, web, contracts, scripts, and docs.

**Done so far:** 43 of 59 checklist items are complete. The retired two-agent ownership,
contract-proposal, status, prompt, and resume instructions have been replaced with one solo
workflow. Contract prose matches the shipped config/project/push routes, and architecture prose
matches the accepted root-runtime decision. All application source is unchanged.

**Next concrete step:** the owner runs the Phase 3 exit criterion: lock the subscribed phone,
put it aside, make an agent reach a permission prompt, confirm notification within five seconds,
then tap it and confirm the correct pane opens focused. Record the result; only then mark Phase 3
Verified and begin the Phase 4 worktree/diff contract.

**Landmines:** system Node is 20 although the project requires 22+, and the installed global
pnpm is 11 although the project pins 10.15; use an explicit compatible runtime/toolchain for
validation. A database session can still outlive its tmux session and remain incorrectly shown
as idle. Phase 4 must define worktree creation, dirty deletion, diff limits, and collision
signaling in contracts before server or UI implementation.

**Uncommitted:** none after the solo-workflow documentation unit is committed.

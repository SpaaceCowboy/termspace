# Current state — Termspace (solo)

**Phase:** 3 is built but not verified; phases 0–2 are built and human-verified.

**Working on:** the Phase 3 locked-phone Web Push exit gate. No implementation work is in
flight; current Phase 3 robustness work is complete.

**Done so far:** 43 of 59 checklist items are complete. The repository uses one solo workflow,
contract/API/security prose matches the implementation, and dead rows now reconcile against a
real tmux snapshot every five seconds. The liveness path passed unit tests and a real-tmux check;
all packages typecheck and all server, web, and contract unit suites pass.

**Next concrete step:** the owner runs the Phase 3 exit criterion: lock the subscribed phone,
put it aside, make an agent reach a permission prompt, confirm notification within five seconds,
then tap it and confirm the correct pane opens focused. Record the result; only then mark Phase 3
Verified and begin the Phase 4 worktree/diff contract.

**Landmines:** system Node is 20 although the project requires 22+, and the installed global
pnpm is 11 although the project pins 10.15; use an explicit compatible runtime/toolchain for
validation. Phase 4 must define worktree creation, dirty deletion, diff limits, and collision
signaling in contracts before server or UI implementation.

**Uncommitted:** none after the dead-session reconciliation unit is committed.

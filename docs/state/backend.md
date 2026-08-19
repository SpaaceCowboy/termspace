# Current state — Termspace (solo)

**Phase:** Phase 6 — operations and interface refinement; built, deployed, awaiting owner
verification.

**Working on:** Deploying and owner-verifying the Phase 6 UX reliability pass: guided session
creation, explicit lifecycle state, resilient viewer reconnection, and contextual deletion.

**Done so far:** Phases 0–5 are implemented and verified. Phase 6 favorites, operational telemetry,
sanitized journal summaries, attention ordering, operations UI, reconnect behavior, responsive
polish, and accessibility refinements are built. Repository-wide tests, typechecks, production
builds, real Git/tmux checks, and desktop/phone browser checks pass on the declared Node 24/pnpm 10
toolchain. The owner deployed Termspace to Ubuntu 26.04 with a dedicated named tmux server, gateway,
web service, backup timer, isolated journal, Caddy HTTPS, SQLite storage, and `/srv/projects`; login
and HTTP health work at `https://termspace.94-184-36-243.sslip.io`.

Production diagnostics proved session creation itself was healthy: the transient scope remained
active, the pane was alive under zsh, and manual attachment through `/run/termspace/tmux.sock`
worked. `ViewerAttachmentFactory` now consumes the configured attach command, including the named
socket; the owner deployed that fix and confirmed a new real session works.

The creation flow now shows the project path, actual command, worktree mode, optional initial
prompt, and availability of default agent commands in the gateway runtime PATH. The server also
checks project overrides before mutation and returns `agent_unavailable`. Lifecycle UI distinguishes
starting, ready, agent-working, needs-input, reconnecting, viewer failure, and true exit with common
exit causes. Viewer exit no longer implies tmux death: the gateway verifies liveness, exposes a
recoverable per-view reattach when tmux remains alive, and only marks a genuinely absent session
dead. During socket recovery the existing terminal stays painted, input is queued, viewport offset
is restored, and the focused pane regains focus. Deletion confirmation now states exactly what
happens to tmux, scrollback, project files, worktrees, uncommitted changes, commits, and branches.
All package tests/typechecks and the HTTP production build pass; the compiled production fixture UI
was rendered and inspected in headless Chrome.

**Next concrete step:** push the UX reliability commit; on the VPS pull, rebuild contracts/server/web,
restart gateway and web, then verify Claude is disabled while absent, create Shell and Codex sessions,
exercise a gateway restart/reconnect, inspect standard/worktree delete copy, and finish the Phase 6
real-data desktop/phone exit criterion.

**Landmines:** system Node is 20 and global pnpm is 11 on the development machine, so use the
explicit Node 24/pnpm 10 toolchain. Every session operation and viewer attachment must use the same
configured tmux socket; falling back to tmux's default socket recreates the production failure.
Claude is not installed on the VPS, so the default Claude option must remain disabled until its CLI
is installed; project overrides are checked on submit because they can name a different executable.
An initial prompt is terminal input: keep it bounded and absent from every log/error surface. Viewer
attachment failure and tmux process death are different states and must never be collapsed again.
The tmux server must remain independently owned by `termspace-tmux.service`, and transient scopes do
not inherit service sandbox directives. Operational events must only be reconstructed from
allowlisted structured fields; never expose raw journal messages, argv, request data, credentials,
tickets, or terminal bytes.

**Uncommitted:** none expected after committing the Phase 6 UX reliability pass, shared contract and
fixtures, regressions, progress entry, and this resume update.

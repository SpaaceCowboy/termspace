# Current state — Termspace (solo)

**Phase:** Phase 6 — operations and interface refinement; built, deployed, awaiting owner
verification.

**Working on:** Real production verification. The first VPS session attempt exposed a tmux viewer
socket mismatch; the repository fix is complete and must now be deployed and checked through the
real browser path.

**Done so far:** Phases 0–5 are implemented and verified. Phase 6 favorites, operational telemetry,
sanitized journal summaries, attention ordering, operations UI, reconnect behavior, responsive
polish, and accessibility refinements are built. Repository-wide tests, typechecks, production
builds, real Git/tmux checks, and desktop/phone browser checks pass on the declared Node 24/pnpm 10
toolchain. The owner deployed Termspace to Ubuntu 26.04 with a dedicated named tmux server, gateway,
web service, backup timer, isolated journal, Caddy HTTPS, SQLite storage, and `/srv/projects`; login
and HTTP health work at `https://termspace.94-184-36-243.sslip.io`.

Production diagnostics proved session creation itself was healthy: the transient scope remained
active, the pane was alive under zsh, and manual attachment through `/run/termspace/tmux.sock`
worked. `ViewerAttachmentFactory` had ignored `TmuxClient.attachCommand()` and attached through the
default socket, so its viewer exited with code 1 and persisted a false dead state. It now consumes
the configured attach command. The regression asserts the exact `-S /run/termspace/tmux.sock`
argv; all package tests, typechecks, and builds pass.

**Next concrete step:** push this fix, then on the VPS pull it, build `@termspace/server`, restart
`termspace-gateway.service`, delete the disposable dead test session, and create a fresh Shell
session. Once terminal attachment works, verify a Codex session and complete the Phase 6 real-data
desktop/phone exit criterion.

**Landmines:** system Node is 20 and global pnpm is 11 on the development machine, so use the
explicit Node 24/pnpm 10 toolchain. Every session operation and viewer attachment must use the same
configured tmux socket; falling back to tmux's default socket recreates the production failure.
The current persisted test row is dead even though its old pane is alive; deleting that disposable
session is safe after deploying the fix. Claude is not installed on the VPS, so Claude sessions are
expected to fail until its CLI is installed and authenticated; this does not affect Shell or Codex.
The tmux server must remain independently owned by `termspace-tmux.service`, and transient scopes do
not inherit service sandbox directives. Operational events must only be reconstructed from
allowlisted structured fields; never expose raw journal messages, argv, request data, credentials,
tickets, or terminal bytes.

**Uncommitted:** none expected after committing the production tmux viewer socket regression fix,
its test, progress entry, and this resume update.

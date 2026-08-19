# Current state — Termspace (solo)

**Phase:** Phase 6 — operations and interface refinement; built, deployed, awaiting owner
verification.

**Working on:** Deploying and owner-verifying the Phase 6 UX reliability and personalization pass:
guided session creation, explicit lifecycle state, resilient viewer reconnection, appearance
preferences, and persistent notification history.

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

The workspace now has validated, browser-local appearance preferences for UI font, interface
density, contrast, terminal theme, and terminal font size. Applying terminal preferences updates all
open xterm panes immediately and preserves the current viewer. Transient toasts are also retained in
a validated, capped 50-item browser-local notification history with unread count, timestamps,
mark-read behavior, and clear-all. Only sanitized UI notices are retained; terminal output and raw
server data are never stored. All package tests and typechecks and the HTTP production build pass.
The compiled fixture UI was rendered in desktop and 390-pixel mobile Chrome: both dialogs, high
contrast, large terminal text, history persistence, unread state, and no horizontal overflow were
personally observed.

**Next concrete step:** on the VPS pull the current `main`, rebuild, and restart the web service. The
owner should verify both dialogs against real data, then exercise the
remaining Phase 6 real-data desktop/phone exit criterion: Shell and Codex creation, gateway
restart/reconnect, and standard/worktree deletion copy.

**Landmines:** system Node is 20 and global pnpm is 11 on the development machine, so use the
explicit Node 24/pnpm 10 toolchain. Appearance and notification history are intentionally local to
each browser profile and are not account-synced. Notification history must remain limited to
sanitized UI notices; never persist terminal bytes, raw push payloads, credentials, tickets, or
server log data. Every session operation and viewer attachment must use the same configured tmux
socket; falling back to tmux's default socket recreates the production failure. Claude is not
installed on the VPS, so the default Claude option must remain disabled until its CLI is installed.
An initial prompt is terminal input: keep it bounded and absent from every log/error surface. Viewer
attachment failure and tmux process death are different states and must never be collapsed. The
tmux server must remain independently owned by `termspace-tmux.service`, and transient scopes do not
inherit service sandbox directives.

**Uncommitted:** none.

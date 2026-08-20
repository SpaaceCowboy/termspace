# Current state — Termspace (solo)

**Phase:** Phase 6 — built and deployed; owner verification remains open.

**Working on:** Deploying and live-verifying the completed Phase 6 audit fixes without restarting the
session-owning tmux service.

**Done so far:** Phases 0–5 are built and owner-verified. Phase 6 is built. The deployed checkout is
clean at commit `184dcf2a0d294bcbd33cf21cedee370cde392392` and includes the final stable xterm renderer,
initial-resize preservation, named tmux socket, hidden tmux status line, and default Codex
`tui.alternate_screen="always"` fixes. Live inspection confirmed gateway, web, tmux, Caddy, and the
backup timer are healthy with zero restarts; the gateway and web were restarted for this deployment
while the tmux server and its Shell/Codex sessions survived. Live viewer geometry reaches tmux, the
Codex scope uses the alternate-screen command, and each transient session scope has a 2 GiB memory
limit. The daily SQLite backup exists, completed successfully, and passes the real backup verifier.
The public health endpoint, exact WebSocket origin configuration, authentication boundary, database
permissions, and TLS proxy path are active. Repository-wide typechecks, 65 automated test files,
and the production build pass on Node 24.19.0/pnpm 10.15.0.

The audit was rechecked through 2026-08-20. Gateway, web, tmux, Caddy, and the backup timer remain
active with zero restarts. HTTPS `/api/health` returns 200 through Caddy, the Let's Encrypt
certificate is valid from 2026-08-19 through 2026-11-17, both live tmux sessions and their 2 GiB
systemd scopes are active, disk usage is 31%, and 1.4 GiB of 1.9 GiB RAM is available. The daily
2026-08-20 SQLite backup completed successfully; the preceding backup passes the real verifier.

All audit findings are fixed in the development checkout. Next.js binds to `127.0.0.1` in both the
package start command and systemd unit, and regression tests lock down both paths. Release metadata,
health, operations, and fixtures now consistently report `1.0.0`. Fastify uses the supported
`LogController`; compile caches are ignored and the generated artifact is removed. Viewer teardown
maps the validated node-pty child PID to one exact tmux client and detaches it normally, with bounded
fallback cleanup, rather than killing the PTY first and provoking libevent warnings. All package
typechecks, 66 test files, and the production build pass on the VPS. Production deployment and live
post-deploy checks remain. Obsolete, ignored `CPUAccounting=` slice directives found during installed
unit verification are also removed; memory/tasks accounting and session limits are unchanged.

A controlled live test proved graceful exact-client detach still triggers tmux 3.6's warning. Its
zero lock timeout initializes a timer without attaching it to libevent; the next activity deletes
that unattached timer. `tmux.conf` now uses the maximum 32-bit timeout (about 68 years), preserving
effectively-disabled locking while keeping the event attached. This can be sourced live without a
tmux restart; regression coverage fixes the workaround in the deployed configuration.

**Next concrete step:** commit and push the audit fixes, update and build `/opt/termspace`, install the
web unit, daemon-reload, and restart only gateway and web. Confirm both tmux sessions survive, ports
3001/3002 are loopback-only, direct public port 3002 is unreachable, HTTPS health reports `1.0.0`,
and a controlled viewer detach adds no tmux/libevent warning.

**Landmines:** Never restart `termspace-tmux.service` during a deploy; source `server/tmux.conf`
instead, because restarting it destroys every running session. Every session operation and viewer
attachment must use `/run/termspace/tmux.sock`. Keep default Codex alternate-screen mode and the
stable built-in xterm renderer unless upstream behavior is verified fixed. Initial resize frames may
arrive before subscription capture and must remain queued. Appearance/notification history is
browser-local, and notification history must never contain terminal bytes, raw server data, tickets,
credentials, or push payloads. Claude is not installed on this VPS. Existing project-specific agent
overrides bypass defaults. The direct-port finding is externally relevant even though secure cookies
prevent an authenticated session from being sent over plain HTTP.

**Uncommitted:** the complete audit-fix implementation and its progress/state documentation; no
unrelated user changes are present.

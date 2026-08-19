# Decisions

Lightweight ADRs. One entry per real fork in the road. If you spent more than
ten minutes choosing between two options, write it down — otherwise the other
agent, or you in three weeks, will reopen it.

## Format

```
## <number>. <the decision, as a statement>
Date · Decided by · Status: accepted | superseded by #N

**Context** — what forced a choice
**Options** — what was actually on the table
**Choice** — what was picked, and the one reason that decided it
**Consequence** — what is now harder
```

Do not write an entry for a choice with no real alternative.

---

## 1. tmux owns sessions; the app process is disposable
2026-01-01 · Human · Status: accepted

**Context** — Something has to hold the PTY. If the Node process owns it,
every deploy and every crash kills every running agent.

**Options** — (a) Node owns PTYs directly via node-pty; (b) tmux owns
sessions and Node attaches as a client; (c) a custom detach daemon.

**Choice** — (b). The entire value of the product is that agent runs survive
the things that kill laptop sessions. Owning PTYs in the web process
surrenders that on day one.

**Consequence** — tmux is a hard dependency and its quirks are now ours,
in particular client-driven window sizing. Some state has to be read back
out of tmux rather than held in memory.

---

## 2. One multiplexed WebSocket, not one per pane
2026-01-01 · Human · Status: accepted

**Context** — The grid shows several terminals at once.

**Options** — (a) a socket per pane; (b) one socket carrying frames tagged
with a session id.

**Choice** — (b). Ticket handshake, reconnect, and backoff get written once
instead of N times and cannot drift out of sync between panes. It also lets
the server prioritise frames for the focused pane.

**Consequence** — Every frame needs a session id, and a single slow consumer
affects all panes, so per-session coalescing and frame dropping are required
rather than optional.

---

## 3. Activity state is derived, never self-reported
2026-01-01 · Human · Status: accepted

**Context** — The workspace needs to show which session needs attention.

**Options** — (a) parse agent session files or ask agents to report status;
(b) derive from PTY output timing and trailing-line patterns.

**Choice** — (b). It works identically for Claude Code, Codex, and a bare
shell, and requires no cooperation from the agent or knowledge of its
internal formats, which change without notice.

**Consequence** — Prompt patterns are heuristics and will need maintenance.
They live in one file so that maintenance is cheap.

---

## 4. The browser talks to one origin in dev, via a Next proxy
2026-08-10 · Claude Code · Status: accepted

**Context** — In production Caddy serves the UI and the gateway on one origin.
In dev they are two ports, and the gateway authenticates the WebSocket with an
exact `Origin` match and the session with a `SameSite=Strict` cookie.

**Options** — (a) call the gateway cross-origin from `:3000` and add CORS to the
server; (b) proxy `/api/*` and `/ws` through Next so the browser only ever sees
its own origin; (c) run the UI from the gateway in dev.

**Choice** — (b). It needs no server change and no CORS surface that exists only
in dev, and it makes the dev topology the same shape as production, so the
cookie and `Origin` paths are exercised the way they will actually ship. The
WebSocket upgrade was verified to survive the proxy.

**Consequence** — `next dev` is in the request path in development, and the
gateway location is a build-time concern (`TERMSPACE_GATEWAY_ORIGIN`) rather
than a runtime one. A production deploy must keep both on one origin.

## 5. Project directories are confined to a configured root
2026-08-11 · Claude Code · Status: accepted

**Context** — `POST /api/projects` took any absolute path, and `POST
/api/sessions` took any existing `cwd` regardless of which project it claimed.
On a public VPS that means a project, and therefore an agent's working
directory, could be `$HOME` or the app's own data directory.

**Options** — (a) leave it open, on the grounds that a session is already an
arbitrary shell so confinement proves nothing; (b) confine project paths to a
configured root and a session's `cwd` to its own project; (c) a real sandbox
per session (containers, bubblewrap).

**Choice** — (b). (a) is right about security and wrong about everything else:
the point is not to stop an attacker who already has a session, it is that
phase 5's systemd unit cannot declare `ReadWritePaths` if projects can live
anywhere, agents cause accidental damage through cwd, and backups need one
tree. (c) is a different product.

**Consequence** — `TERMSPACE_PROJECT_ROOT` (default `/srv/projects`) must exist
and be writable by the app user, or every project creation fails. Adopting a
repo that already lives elsewhere on the box now needs a move or a bind mount.
The check is on the normalized path string, so a symlink under the root that
points outside it is not caught.

## 6. The app runs with root privileges, not as an unprivileged user
2026-08-11 · Shayan (owner) · Status: accepted · **Supersedes non-negotiable #3**

**Context** — `PROJECT.md` non-negotiable #3 said the app runs as an
unprivileged user with no sudo. That makes a session unable to install anything
system-wide: `apt install nodejs` fails, and so does every other package the
owner might want in a project. This is a single-user box run by its owner, who
is already root on it by other means (ssh).

**Options** — (a) keep no sudo, install system packages out of band over ssh;
(b) unprivileged user with NOPASSWD sudo scoped to `apt-get` only; (c) run as
root, or as a user with unrestricted sudo.

**Choice** — (c), decided by the owner. (a) is the safest and was the original
position; (b) buys most of the convenience for a fraction of the exposure. Both
were declined: the owner is the only user and wants an unrestricted shell.

**Consequence** — this is a real and deliberate widening of the blast radius,
recorded so nobody has to rediscover it:

- An agent session can destroy or reconfigure the box. Agents read untrusted
  repository content, so prompt injection now reaches root.
- Any flaw in the auth, ticket, or `Origin` path becomes remote **root**
  compromise rather than compromise of one unprivileged account.
- The project-root containment in decision #5 keeps its value as a guard
  against *accidents* only. As a security boundary it is gone: root can leave
  the root at will.
- The phase 5 systemd hardening (`ProtectSystem=strict`, `ProtectHome`,
  `NoNewPrivileges`, `ReadWritePaths`) becomes the *only* remaining boundary,
  which raises its priority rather than lowering it. `NoNewPrivileges` in
  particular has to be reconsidered, since it would break `sudo` inside a
  session.
- Backups and the SQLite file are now root-owned; the 0600/0700 modes stay.

**Reversing this** is a matter of changing the systemd `User=`, `chown`-ing the
project root and data directory, and accepting that sessions lose `sudo`.

## 7. Foreground tmux service plus one transient scope per session
2026-08-17 · Codex · Status: accepted

**Context** — A daemonized tmux server stays in the cgroup that first launched
it. If that is the gateway service, a normal gateway restart kills every agent.
A single separate tmux cgroup fixes restart survival but cannot enforce a
different memory ceiling for each session, because every pane inherits that
same cgroup.

**Options** — (a) daemonized tmux launched by the gateway with a permissive
`KillMode`; (b) one foreground tmux service containing every shell; (c) a
foreground tmux service for ownership, with each pane command moved into its
own transient systemd scope.

**Choice** — (c). `tmux -D` lets systemd own the real server process and keeps
it alive while empty. `systemd-run --scope` preserves the pane's PTY while
placing its complete agent process tree under an independent `MemoryMax` in
`termspace-sessions.slice`. Gateway and tmux share a dedicated socket under
`/run/termspace`; `/tmp` cannot be shared once both units use `PrivateTmp`.

**Consequence** — systemd is now a production runtime dependency, not only an
installer. The gateway needs permission to create and stop transient scopes;
development leaves scope wrapping disabled. The tmux service must be started
before the gateway, its socket path must match the gateway configuration, and
stopping that service is destructive even though restarting the gateway is not.

## 8. Use xterm's built-in renderer instead of switching WebGL by focus
2026-08-19 · Codex · Status: accepted

**Context** — Termspace loaded `@xterm/addon-webgl` only for the focused pane and disposed it when
focus moved. In xterm 6 the WebGL and DOM renderers can calculate different cell widths. Production
then showed corrupted glyph blocks, a duplicated tmux status line, and a cursor painted at the click
position instead of the shell cursor. The terminal input path and tmux session remained healthy;
the GPU-rendered view was wrong.

**Options** — (a) keep switching WebGL and try to refresh or refit after every focus change; (b)
keep one WebGL context for every visible terminal; (c) use xterm's built-in renderer for every pane.

**Choice** — (c). A forced refresh cannot reconcile two different cell grids, and keeping several
WebGL contexts increases browser-specific failure and lifecycle risk. Termspace renders at most four
bounded panes, while hidden panes remain headless, so the built-in renderer is fast enough.

**Consequence** — `@xterm/addon-webgl` is removed. Focus changes no longer swap renderers or recreate
cell geometry. GPU acceleration is unavailable for now; it may return only after xterm provides one
stable renderer/grid across focus transitions and a real Codex/tmux browser regression passes.

## 9. Keep tmux invisible and run the default Codex TUI in alternate-screen mode
2026-08-19 · Codex · Status: accepted

**Context** — Correcting renderer selection and propagating the live browser geometry to tmux
removed two Termspace bugs, but Codex 0.147's inline TUI still corrupts in xterm.js. Its inline
history uses terminal scroll-region operations that xterm.js does not preserve reliably. The tmux
status line also duplicates workspace chrome and makes the browser render another full-screen row.
tmux itself remains necessary because it owns sessions independently of the browser and gateway.

**Options** — (a) remove tmux and give up restart-safe sessions; (b) interpret or rewrite Codex's
terminal stream in the gateway; (c) keep tmux as an invisible persistence layer, hide its status
line, and launch the default Codex command with its supported alternate-screen mode forced on.

**Choice** — (c). The default Codex argv is now
`["codex", "-c", "tui.alternate_screen=\"always\""]`, and the production tmux configuration uses
`status off`. Project-specific command overrides remain authoritative.

**Consequence** — new default Codex sessions isolate full-screen redraws from shell scrollback and
the green tmux status bar is no longer visible. Exiting Codex returns to the shell without leaving
its alternate-screen transcript behind. Existing sessions keep their original launch arguments,
and custom Codex command overrides must opt into alternate-screen mode themselves. The tmux service
must not be restarted merely to apply the status setting because that would terminate its sessions;
source the configuration into the running server instead.

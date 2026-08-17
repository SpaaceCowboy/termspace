# systemd deployment

These units deliberately put three kinds of process in different cgroups:

```text
termspace.slice
├── termspace-gateway.service     disposable Node API/WS process
├── termspace-tmux.service        foreground tmux server, never gateway-owned
└── termspace-sessions.slice
    ├── termspace-session-<id>.scope  MemoryMax=<configured bytes>
    └── termspace-session-<id>.scope  one complete agent process tree
```

`tmux -D` is essential: systemd owns the real server process directly, and
`exit-empty` is disabled, so it remains available before the first session and
after the last. The gateway connects through `/run/termspace/tmux.sock`, not
`/tmp`: gateway and tmux have separate `PrivateTmp` namespaces. A
gateway restart affects only `termspace-gateway.service`; it cannot reach the
tmux service or the transient session scopes.

## Install

The production checkout is `/opt/termspace`. Build it with Node 22 or newer:

```sh
cd /opt/termspace
pnpm install --frozen-lockfile
pnpm build
install -d -m 0755 /etc/termspace /var/lib/termspace /srv/projects
install -m 0644 deploy/systemd/runtime.env.example /etc/termspace/runtime.env
install -m 0600 deploy/systemd/server.env.example /etc/termspace/server.env
install -m 0644 deploy/systemd/termspace.slice /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-sessions.slice /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-tmux.service /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-gateway.service /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-web.service /etc/systemd/system/
```

Edit both environment files. `runtime.env` must locate Node, Codex, and Claude
without relying on `.zshrc`; `server.env` must use the public browser origin,
the real project root, and a persistent database path. If the project root is
not `/srv/projects`, add a systemd drop-in that replaces the units'
`ReadWritePaths` with the exact configured path. The tmux unit keeps
`ProtectSystem=strict`, `ProtectHome=read-only`, and `PrivateTmp=yes`; explicit
writable exceptions preserve the owner's decision that root agent sessions may
install system packages and update their CLI state. Then:

```sh
systemd-analyze verify /etc/systemd/system/termspace*.service /etc/systemd/system/termspace*.slice
systemctl daemon-reload
systemctl enable --now termspace-tmux.service termspace-gateway.service termspace-web.service
```

Check the ownership boundary before putting Caddy in front:

```sh
systemctl show termspace-tmux.service -p MainPID -p ControlGroup
systemctl show termspace-gateway.service -p MainPID -p ControlGroup
systemctl show 'termspace-session-*.scope' -p ControlGroup -p MemoryMax
systemctl restart termspace-gateway.service
tmux -S /run/termspace/tmux.sock list-sessions
```

The last list must still contain every session. Never replace the foreground
tmux unit with a daemonized `tmux start-server` launched by the gateway: the
daemon retains the gateway cgroup and will be killed on restart.

Stopping `termspace-tmux.service` is intentionally destructive to all running
sessions. Routine deploys restart only gateway and web. Session deletion stops
its transient scope after removing the tmux session, so daemonized children
cannot outlive the row.

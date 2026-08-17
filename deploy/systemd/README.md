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
install -d -m 0700 /var/backups/termspace
install -d -m 0755 /etc/systemd/journald@termspace.conf.d
install -m 0644 deploy/systemd/runtime.env.example /etc/termspace/runtime.env
install -m 0600 deploy/systemd/server.env.example /etc/termspace/server.env
install -m 0644 deploy/systemd/termspace.slice /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-sessions.slice /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-tmux.service /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-gateway.service /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-web.service /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-backup.service /etc/systemd/system/
install -m 0644 deploy/systemd/termspace-backup.timer /etc/systemd/system/
install -m 0644 deploy/systemd/journald-termspace.conf /etc/systemd/journald@termspace.conf.d/retention.conf
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
systemctl restart systemd-journald@termspace.service
systemctl enable --now termspace-tmux.service termspace-gateway.service termspace-web.service
systemctl enable --now termspace-backup.timer
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

## Database backup and restore

`termspace-backup.timer` runs daily, catches up after downtime, and adds up to
30 minutes of jitter. The oneshot service uses SQLite's online backup API, so a
live WAL database is copied transactionally; never replace it with `cp` against
the running database. Snapshots are mode 0600 in
`/var/backups/termspace`, and the newest 14 are retained by default. Change
`TERMSPACE_BACKUP_DIRECTORY` or `TERMSPACE_BACKUP_RETENTION_COUNT` in
`server.env` if needed.

Test the timer immediately after installation:

```sh
systemctl start termspace-backup.service
systemctl status termspace-backup.service
systemctl list-timers termspace-backup.timer
ls -l /var/backups/termspace/
```

To restore, choose a snapshot and validate it before stopping anything. The
tmux service stays running throughout, so agent processes survive; only the
gateway is stopped while its database is replaced.

```sh
cd /opt/termspace/server
node dist/database/verify-backup-cli.js /var/backups/termspace/termspace-YYYY-MM-DDTHH-MM-SS.sssZ.sqlite3
systemctl stop termspace-gateway.service
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mv /var/lib/termspace/termspace.db "/var/lib/termspace/termspace.db.before-restore-$stamp"
test ! -e /var/lib/termspace/termspace.db-wal || mv /var/lib/termspace/termspace.db-wal "/var/lib/termspace/termspace.db-wal.before-restore-$stamp"
test ! -e /var/lib/termspace/termspace.db-shm || mv /var/lib/termspace/termspace.db-shm "/var/lib/termspace/termspace.db-shm.before-restore-$stamp"
install -m 0600 /var/backups/termspace/termspace-YYYY-MM-DDTHH-MM-SS.sssZ.sqlite3 /var/lib/termspace/termspace.db
systemctl start termspace-gateway.service
curl --fail http://127.0.0.1:3001/api/health
```

Keep the three `before-restore` files until the restored application has been
checked. To roll back, stop the gateway, remove only the newly installed
`termspace.db` and its new `-wal`/`-shm` siblings, move the timestamped files
back to their original names, and start the gateway again.

## Logs and retention

All Termspace services use the dedicated `termspace` journal namespace. The
checked-in namespace config compresses and rotates its files daily, caps them
at 256 MiB, keeps at least 1 GiB free, and removes records older than 14 days.
This is isolated from the host's default journal; changing it does not shorten
retention for unrelated services.

The gateway emits one `http_request_complete` JSON object per response with
method, path, route, remote address, status, and duration. Query strings,
headers, and bodies are excluded. Logger serializers also remove query strings,
known credential fields are redacted, and error objects are reduced to name and
safe machine code so command output or third-party request objects cannot leak.

Read and verify the namespace with:

```sh
journalctl --namespace=termspace -u termspace-gateway.service --output=json
journalctl --namespace=termspace --disk-usage
systemctl status systemd-journald@termspace.service
```

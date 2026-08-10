# Architecture

```
  Browser              Phone
     |                   |
     +---------+---------+
               |  https / wss
        +------v-------------------------+
        |  Caddy                         |
        |  TLS, rate limit, origin gate  |
        +------+-------------------------+
               |
        +------v-------------------------------------------+
        |  Node app (killable at any time)                  |
        |                                                   |
        |  Next.js UI  |  Auth  |  WS gateway  |  SQLite     |
        |  xterm.js    | argon2 | node-pty     | projects,   |
        |              | + TOTP | + multiplex  | users,      |
        |              |        |              | layouts     |
        +------+--------------------------------------------+
               |  tmux attach / send-keys / capture-pane
        +------v-------------------------------------------+
        |  tmux server (survives everything above)          |
        |                                                   |
        |  ts_api-refactor   ts_portal-ui   ts_scratch       |
        |  claude code       codex          bash             |
        +------+--------------------------------------------+
               |
        +------v-------------------------------------------+
        |  /srv/projects/<slug>  +  git worktrees           |
        +--------------------------------------------------+
```

## Session lifecycle

A session is a `tmux` session named `ts_<sessionId>`, created detached:

```
tmux new-session -d -s ts_<id> -c <cwd> -x 200 -y 50
```

The gateway attaches a `node-pty` process running `tmux attach -t ts_<id>`
per **connected viewer**, not per session. Zero viewers means zero PTYs and the
agent keeps running inside tmux regardless.

`window-size latest` is set globally in `server/tmux.conf` so a phone attaching
does not shrink a desktop pane. Each pane in the grid is its own tmux session,
so panes never fight each other over size; the only contention is one session
viewed from two devices.

## Reconnect and restore

The gateway keeps, per session, a headless `xterm.js` `Terminal` fed the same
byte stream as the client. On connect it emits a `restore` frame produced by
`@xterm/addon-serialize`, giving exact cursor position, colours, and scrollback
instead of a blank screen. If the app restarted and no headless buffer exists,
it falls back to `tmux capture-pane -e -p -S -2000`.

## Output handling

PTY output is coalesced per session before being sent:

- focused session: 16 ms frames
- visible but unfocused: 50 ms frames
- hidden: 250 ms frames, and the client keeps a headless Terminal only

Frames are dropped, never queued unboundedly. If a session exceeds a byte
budget in a window, the gateway sends a `truncated` marker and resyncs from the
headless buffer.

## Activity detection

Derived, never reported. Per session the gateway tracks last-output timestamp
and the trailing line of the headless buffer.

| State | Rule |
|---|---|
| `working` | output within the last 3 s |
| `needs-you` | no output for >3 s and trailing line matches a prompt pattern |
| `idle` | no output for >3 s, no prompt match |

Prompt patterns live in `server/src/activity/patterns.ts` and are per-agent
(Claude Code's numbered permission prompt, Codex's confirm, a bare shell `$`).

## Security model

- Caddy terminates TLS and rejects requests with a foreign `Origin`
- Login: argon2id password + mandatory TOTP, rate-limited, no registration
- Session cookie: `httpOnly; Secure; SameSite=Strict`, short TTL, rotated
- WebSocket: `POST /api/ws-ticket` returns a single-use token with a 10 s TTL,
  redeemed in the handshake. The `Origin` header is validated again server-side.
- The app user has no sudo. Per-session memory ceiling via a systemd slice.

The threat model is honest: this app is a deliberate remote shell. Auth is the
only wall. Everything else is damage limitation.

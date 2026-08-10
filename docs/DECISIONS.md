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

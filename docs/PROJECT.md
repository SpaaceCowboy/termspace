# Termspace — project brief

A self-hosted web workspace, running on a single VPS, where you create real
terminal sessions against projects that live on that server and run any coding
CLI (Claude Code, Codex, plain shell) inside them. Multiple terminals visible
at once. Sessions outlive the browser, the app process, and the deploy.

Read this file first. It does not change often. When it does, the change is
recorded in `docs/DECISIONS.md`.

## Why it exists

Agents run for tens of minutes. A laptop lid closing should not kill them.
Running three or four at once across projects means losing track of which one
is blocked, which is thrashing, and what changed. This gives them a permanent
home and a single pane of glass over it.

## The one-sentence shape

`tmux` owns the sessions, a Node gateway attaches to them over a multiplexed
WebSocket, and a Next.js grid of `xterm.js` panes renders them in a browser.

## In scope

- Real interactive terminals in the browser, multiple at once
- Projects as first-class objects (path, repo, default branch, setup command)
- Sessions bound to a project, persisting across disconnects and restarts
- Derived activity state per session: working / idle / needs-you
- Git worktree per session for same-project parallelism
- Diff review of what a session changed
- Phone as a first-class client
- Public exposure over TLS with real authentication

## Out of scope

Anything not on the list above is out of scope until it is added here by an
explicit decision entry. In particular, out of scope for v1:

- Multi-tenancy or organisations. A small fixed set of seeded users.
- Running agents anywhere but this one VPS
- An IDE, file tree, or editor. The terminal is the interface.
- Orchestrating agents automatically. The human decides what runs.
- Billing, telemetry, analytics

## Non-negotiables

1. `tmux` owns every session. The app process must be killable at any moment
   without ending a single agent run. This is the reason the product exists;
   no optimisation is worth breaking it.
2. The WebSocket is authenticated by a single-use ticket **and** an `Origin`
   check. Never by cookie alone.
3. ~~The app runs as an unprivileged user with no sudo~~ — **superseded by
   decision #6 (2026-08-11)**: it runs with root privileges so that a session
   can install system packages. The box must therefore host nothing else that
   matters, and the phase 5 systemd hardening is now the only boundary left.
4. Every displayed session state is derived from observed output. Agents are
   never asked to self-report.

## The two agents

| | Owner | Owns | Never edits |
|---|---|---|---|
| Backend | Codex | `server/**` | `web/**` |
| Frontend | Claude Code | `web/**` | `server/**` |

Both read all of `docs/**`. Both may append to `docs/PROGRESS.md`.
`packages/contracts/**` is shared and changes only by the process in
`docs/CONTRACTS.md`.

## Stack

- Runtime: Node 22, TypeScript throughout
- Backend: Fastify, `ws`, `node-pty`, `better-sqlite3`, `argon2`, `otplib`
- Frontend: Next.js (App Router), `@xterm/xterm` + fit/canvas/webgl/serialize addons
- Session substrate: `tmux` 3.4+
- Edge: Caddy for TLS and reverse proxy
- Package manager: pnpm workspaces

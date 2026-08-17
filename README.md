# Termspace

Termspace is a self-hosted browser workspace for durable terminal sessions.
tmux owns each session, a Fastify gateway attaches viewers through one
authenticated multiplexed WebSocket, and a Next.js/xterm.js UI displays several
projects and sessions at once.

## Repository

```text
server/                     Fastify, auth, SQLite, tmux, PTY, WebSocket, push
web/                        Next.js workspace and xterm.js client
packages/contracts/         shared API, transport types, validation fixtures
docs/PROJECT.md             scope and non-negotiables
docs/ARCHITECTURE.md        runtime flow and security model
docs/PHASES.md              implementation plan and human gates
docs/CONTRACTS.md           authoritative cross-boundary shapes and endpoints
docs/PROGRESS.md            append-only development history
docs/DECISIONS.md           architecture decisions
docs/state/backend.md       single current resume state
```

Codex is the sole developer across the repository. `AGENTS.md` contains the
working protocol.

## Local commands

Termspace requires Node 22 or newer and pnpm 10.15.0.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm dev
```

The web app defaults to port 3002 and proxies `/api/*` plus `/ws` to the
gateway. Copy `server/.env.example` to `server/.env` and configure the allowed
browser origin and project root before exercising the live project/session
flow. Never commit `.env` or `server/data/`.

Run `./scripts/status.sh` at the start of a development session for the current
phase, recent progress, and working-tree state.

Production systemd units, environment examples, and the restart-survival check
are documented in [`deploy/systemd/README.md`](deploy/systemd/README.md). The
tmux unit is persistent; routine deploys restart only gateway and web.

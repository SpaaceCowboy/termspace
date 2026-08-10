# Termspace — scaffold

Drop these files into an empty repo, `git init`, commit, then open two terminal
sessions in it: Codex for the backend, Claude Code for the frontend. The
kickoff prompts are in `docs/PROMPTS.md`.

```
AGENTS.md                  read automatically by Codex
CLAUDE.md                  read automatically by Claude Code
README.md                  this file
scripts/status.sh          run at the start of every agent session
                           usage: ./scripts/status.sh backend|frontend
                           usage: ./scripts/status.sh backend|frontend

docs/
  PROJECT.md               north star, scope, non-negotiables
  ARCHITECTURE.md          how the system fits together
  PHASES.md                the plan, with per-agent boxes and gates
  CONTRACTS.md             the seam — API and WS shapes, change process
  PROGRESS.md              append-only shared log (the ecosystem)
  DECISIONS.md             ADRs for real forks in the road
  CONVENTIONS.md           ownership, git, TS, testing
  PROMPTS.md               what to paste into each agent
  state/backend.md         Codex's resume state — overwritten, not appended
  state/frontend.md        Claude Code's resume state
  state/backend.md         Codex's resume state — overwritten, not appended
  state/frontend.md        Claude Code's resume state

.claude/skills/
  team-protocol/           sync ritual, BROKE rule, blocked handling
  contract-change/         how to change the shared contract
  terminal-client/         xterm.js and WebSocket gotchas

packages/contracts/src/    shared types + fixtures (agents write these)
```

## The idea in one paragraph

Two agents cannot talk. So the repo is the conversation. `CONTRACTS.md` is the
seam they both build against; `PROGRESS.md` is how each finds out what the
other did while it was not running; `PHASES.md` is a ratchet that stops either
one running ahead. Fixtures mean the frontend is never blocked waiting for the
backend. Ownership boundaries mean they never touch the same file. The two
`state/` files are the present tense — where each agent is right now, and where
it resumes from if a session dies mid-task.

Both agents work in one checkout on one branch. Not separate worktrees: each
would get its own `PROGRESS.md` and the whole loop would quietly stop working. And
`docs/state/` is how an agent that died mid-task picks up where it left off
instead of restarting or half-rewriting its own work.

## Order of operations

1. `git init`, commit the scaffold
2. Start Codex, paste the backend kickoff prompt from `docs/PROMPTS.md`
3. Give it an hour on phase 0 so `packages/contracts` exists
4. Start Claude Code, paste the frontend kickoff prompt
5. Read `docs/PROGRESS.md` yourself between phases
6. When both gate boxes for a phase are ticked, run the exit criteria yourself
   before advancing

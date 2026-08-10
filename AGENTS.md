# AGENTS.md — backend agent (Codex)

You are the backend engineer on a two-agent team building Termspace. The other
engineer is Claude Code, working on the frontend in `web/`. You will never talk
to them directly. You coordinate entirely through files in this repository.

## Start of every session, without being asked

1. Read your resume state: `docs/state/backend.md`
2. Read `docs/PROJECT.md` if you have not this session
3. Read the last 30 entries of `docs/PROGRESS.md` — this is what the frontend
   did while you were not running
4. Read `docs/CONTRACTS.md`, including open proposals
5. Read your unchecked boxes for the current phase in `docs/PHASES.md`
6. Say in one line what you are picking up and why, then start

Do not skip steps 1 and 3. Most wasted work on this project will come from not knowing
what the other agent changed.

## What you own

`server/**` and your half of `packages/contracts/**`.

You never edit `web/**`. Not to fix a type error, not to add a field, not to
"quickly check something". If the frontend needs to change, append a `BLOCKED`
entry naming exactly what you need and keep working elsewhere.

## Every time you stop

Rewrite `docs/state/backend.md` — completely, not appended. Do this at the end
of a session, when you finish a task, when you switch tasks, and above all when
you notice you are running low on context. It is the only thing that lets the
next session resume instead of restart.

Keep it to the six fields. `Next concrete step` is the important one: write the
actual next action, not a restatement of the goal.

## What you do at the end of every meaningful unit of work

Append to `docs/PROGRESS.md` in the same commit as the code:

```
### <ISO timestamp> · BACKEND · <phase> · <KIND>
<what is now true that was not before>
```

If you changed anything the frontend consumes — a field name, an error code, a
frame shape, a status code — the kind is `BROKE` and you say precisely what
broke. This is not optional and it is not a courtesy. It is the single highest
value thing you do all day.

## Resume state — read this first, write it last

`docs/state/backend.md` is yours alone. It is not a log; it answers "what was I
in the middle of". Read it **before** `docs/PROGRESS.md` at every session start.
If it says you were mid-task, resume from `Next concrete step` — do not restart
the task and do not rewrite what is already there.

Rewrite it, in full, every time you stop working. That includes stopping
mid-task, and includes the moment you notice you are running low on context.
Fill in every field honestly: `Working on`, `Done so far`, `Next concrete step`,
`Landmines`, `Uncommitted`. A vague resume file is worse than none, because the
next session will trust it.

Never touch `docs/state/frontend.md`.

## Phase discipline

Work only on the current phase. If you finish your boxes and the frontend has
not finished theirs, do not start the next phase. Instead, in order:

1. Write tests for what you just built
2. Write the fixtures the frontend will need next phase
3. Append a `GATE` entry and tick your box
4. Stop and say you are gated

Building ahead is how the two halves diverge.

## Hard rules

- tmux owns every session. Your process must be killable without ending a
  single agent run. Never hold a session's only handle in Node memory.
- Never authenticate a WebSocket by cookie alone. Ticket plus `Origin` check.
- Validate every inbound boundary with zod: HTTP body, WS frame, env.
- Never log a password, a TOTP code, a ticket, or session bytes.
- No new dependency without a `DECISION` entry.
- Types come from `@termspace/contracts`. Never redeclare a shared type.

## Definition of done for a checklist item

- The code works against a real tmux session on this machine
- Unit tests cover the state machine or parser, if it has one
- `pnpm typecheck` and `pnpm test` pass
- Fixtures in `packages/contracts/src/fixtures.ts` match what you actually return
- `docs/PROGRESS.md` has the entry
- The box in `docs/PHASES.md` is ticked

Anything less is `WIP`, not `DONE`.

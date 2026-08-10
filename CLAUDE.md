# CLAUDE.md — frontend agent (Claude Code)

You are the frontend engineer on a two-agent team building Termspace. The other
engineer is Codex, working on the backend in `server/`. You will never talk to
them directly. You coordinate entirely through files in this repository.

## Start of every session, without being asked

1. Read your resume state: `docs/state/frontend.md`
2. Read `docs/PROJECT.md` if you have not this session
3. Read the last 30 entries of `docs/PROGRESS.md` — this is what the backend
   did while you were not running. Look for `BROKE` first.
4. Read `docs/CONTRACTS.md`, including open proposals
5. Read your unchecked boxes for the current phase in `docs/PHASES.md`
6. Say in one line what you are picking up and why, then start

Do not skip steps 1 and 3.

## What you own

`web/**` and your half of `packages/contracts/**`.

You never edit `server/**`. If an endpoint is missing, wrong, or returns the
wrong shape, do not go fix it. Append a `BLOCKED` entry naming exactly what you
need and keep working against the fixture.

## You are never blocked on the backend

`packages/contracts/src/fixtures.ts` exports a valid instance of every type.
Build the whole UI against fixtures behind one swappable data layer. When the
real endpoint lands, you flip a flag. If you find yourself waiting for the
backend, you have coupled to it too tightly — fix that instead of waiting.

## Every time you stop

Rewrite `docs/state/frontend.md` — completely, not appended. Do this at the end
of a session, when you finish a task, when you switch tasks, and above all when
you notice you are running low on context. It is the only thing that lets the
next session resume instead of restart.

Keep it to the six fields. `Next concrete step` is the important one: write the
actual next action, not a restatement of the goal.

## What you do at the end of every meaningful unit of work

Append to `docs/PROGRESS.md` in the same commit as the code:

```
### <ISO timestamp> · FRONTEND · <phase> · <KIND>
<what is now true that was not before>
```

If you need a shape the contract does not have, that is a `CONTRACT` proposal,
not a local type. Never patch around the seam quietly.

## Resume state — read this first, write it last

`docs/state/frontend.md` is yours alone. It is not a log; it answers "what was I
in the middle of". Read it **before** `docs/PROGRESS.md` at every session start.
If it says you were mid-task, resume from `Next concrete step` — do not restart
the task and do not rewrite what is already there.

Rewrite it, in full, every time you stop working. That includes stopping
mid-task, and includes the moment you notice you are running low on context.
Fill in every field honestly: `Working on`, `Done so far`, `Next concrete step`,
`Landmines`, `Uncommitted`. A vague resume file is worse than none, because the
next session will trust it.

Never touch `docs/state/backend.md`.

## Phase discipline

Work only on the current phase. If you finish your boxes and the backend has
not, do not start the next phase. Instead:

1. Write tests for the reconnect logic and the frame codec
2. Handle the ugly states — reconnecting, dead session, truncated output,
   permission denied, zero sessions
3. Append a `GATE` entry and tick your box
4. Stop and say you are gated

## Hard rules

- One multiplexed WebSocket for the entire page. Never one per pane.
- Hidden panes hold a headless `Terminal` and never call `open()`.
- WebGL renderer on the focused pane only; canvas elsewhere. Browsers cap live
  WebGL contexts and blown contexts render blank.
- Every `Terminal`, `ResizeObserver`, socket listener, and timer is disposed on
  unmount. A leaked terminal is a leaked GPU context.
- Never store a ticket, token, or session id in `localStorage`.
- No component library and no CSS framework. Plain CSS modules.
- Types come from `@termspace/contracts`. Never redeclare a shared type.

## Terminal specifics you will get wrong otherwise

- Apply the `restore` frame **before** wiring the input handler, or the first
  keystrokes land in a stale buffer
- Debounce `ResizeObserver` at 100 ms; every resize is a round trip
- Send `vis` on focus change and on `visibilitychange`; the server coalesces
  output based on it and defaults to `visible`
- On reconnect, resubscribe every pane and expect a fresh `restore` for each
- Terminal output arrives as binary frames with a 16-byte id prefix, not JSON

## Definition of done for a checklist item

- Works against fixtures, and against the real backend if it exists
- Loading, error, empty, and reconnecting states all handled
- Keyboard accessible; no mouse-only affordance
- `pnpm typecheck` and `pnpm test` pass
- `docs/PROGRESS.md` has the entry
- The box in `docs/PHASES.md` is ticked

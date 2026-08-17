# AGENTS.md — Termspace sole developer

Codex is the sole developer for Termspace and owns the entire repository:
`server/**`, `web/**`, `packages/contracts/**`, scripts, and documentation.

## Start of every session

1. Read `docs/state/backend.md` first.
2. Read `docs/PROJECT.md` if it has not been read this session.
3. Read the last 30 entries of `docs/PROGRESS.md`.
4. Read `docs/CONTRACTS.md`, including open design notes.
5. Read the unchecked boxes for the current phase in `docs/PHASES.md`.
6. Say in one line what is being resumed and why, then begin.

## Resume state

`docs/state/backend.md` is the single authoritative resume file. Rewrite it in
full whenever work stops, a task changes, or context is running low. Keep these
six fields accurate: `Phase`, `Working on`, `Done so far`, `Next concrete step`,
`Landmines`, and `Uncommitted`.

`docs/state/frontend.md` is retired and must not be used as current state.

## Progress and commits

After every meaningful unit of work, append this entry to `docs/PROGRESS.md` in
the same commit as the change:

```text
### <ISO timestamp> · SOLO · <phase> · <KIND>
<what is now true that was not before>
```

Use `CONTRACT` for a shared API/type change and state the exact old and new
shape. Use `DECISION` for a real fork whose rationale needs to survive. Never
rewrite old progress entries.

## Phase discipline

Work one phase at a time. Finish and test the current phase before starting the
next. `Built` means its checklist and automated/live development checks pass;
`Verified` means the owner personally observed the exit criterion. Never mark a
human verification complete without that evidence.

If implementation is complete while verification is pending, improve tests,
fixtures, documentation, and reproducibility for the current phase. Do not hide
an unverified gate by building ahead silently.

## Hard rules

- tmux owns every session. The app process must be disposable without ending an
  agent run.
- Authenticate WebSockets with a single-use ticket plus an exact `Origin`
  check, never a cookie alone.
- Validate every inbound HTTP body, WebSocket frame, and environment boundary
  with zod.
- Never log a password, TOTP code, ticket, auth token, push payload, or session
  bytes.
- Shared types come from `@termspace/contracts`; never redeclare them locally.
- No dependency without a `DECISION` entry.
- One multiplexed WebSocket serves the page. Hidden panes use headless xterm;
  only the focused pane may use WebGL.
- Dispose every terminal, observer, listener, timer, PTY attachment, and socket.
- No component library or CSS framework without an explicit decision.

## Definition of done

- The feature works through the real server/UI path and, when applicable,
  against a real tmux or git repository on this machine.
- State machines and parsers have unit tests.
- HTTP, WebSocket, and environment inputs have runtime validation.
- `pnpm typecheck` and `pnpm test` pass under the declared Node/pnpm toolchain.
- Contract fixtures match real responses.
- `docs/PROGRESS.md` records the change and `docs/PHASES.md` reflects reality.
- `docs/state/backend.md` names the exact next action before stopping.

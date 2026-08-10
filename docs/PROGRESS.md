# Progress log

Append-only. Newest at the bottom. Never edit or delete another agent's entry;
never edit your own after committing it. If you were wrong, append a correction.

Both agents read the last 30 entries at the start of every session, before
touching any code. This file is how you find out what the other one did while
you were not running.

## Entry format

```
### <ISO timestamp> · <BACKEND|FRONTEND> · <phase> · <KIND>
<one line: what changed, in the imperative>
<optional: second line, only if the other agent needs to know something>
```

`KIND` is one of:

| Kind | Use it when |
|---|---|
| `DONE` | A checklist item in `docs/PHASES.md` is now true |
| `WIP` | You are partway through something and stopping for now |
| `BLOCKED` | You cannot proceed and need the other agent or the human |
| `CONTRACT` | A contract proposal was opened, agreed, or implemented |
| `DECISION` | You chose between real alternatives — also add to `docs/DECISIONS.md` |
| `BROKE` | You changed something that invalidates the other agent's work |
| `GATE` | You have ticked your box for a phase |

`BROKE` is the important one. If you rename a field, change an error code, or
alter a frame shape, the other agent is about to waste an hour. Say so in the
same commit that does it.

## Rules

- Append **before** you commit, in the same commit as the work
- One entry per meaningful unit — not per file, not per session
- Keep it to two lines. This is a log, not a report.
- Never write "made progress on X". Say what is now true that was not before.

## Log

### 2026-01-01T00:00:00Z · HUMAN · 0 · DECISION
Initialise the repository from the scaffold; Codex owns `server/`, Claude Code owns `web/`.
Start at phase 0. Do not begin phase 1 until both gate boxes are ticked.

### 2026-08-10T13:29:23+03:30 · BACKEND · 0 · DONE
Add the pnpm workspace and strict Node 22 server package; recursive backend typechecking passes.

### 2026-08-10T13:33:10+03:30 · BACKEND · 0 · DONE
Add transactional SQLite migrations and constrained schemas for users, projects, sessions, and layouts.

### 2026-08-10T13:35:54+03:30 · BACKEND · 0 · DONE
Boot Fastify with automatic migrations; live `/api/health` returns `{ok:true,data:{version:"0.0.0"}}`.

### 2026-08-10T13:56:55+03:30 · BACKEND · 0 · DONE
Set tmux `window-size latest`; an isolated real tmux session loads and reports the option.

### 2026-08-10T14:02:29+03:30 · BACKEND · 0 · DONE
Add `pnpm seed:user` with hidden password input, argon2id storage, TOTP generation, and otpauth output.

### 2026-08-10T14:03:27+03:30 · BACKEND · 0 · GATE
Tick the Phase 0 backend gate after Node 22 root typechecks/tests and live health, seed, and tmux checks pass.

### 2026-08-10T15:09:00+03:30 · FRONTEND · 0 · DONE
Add `@termspace/contracts` to the workspace, exporting every type this repo's `docs/CONTRACTS.md` writes out, plus a fixture for each and a test that no frame variant or union member is missing one.
The package resolves to built `dist`, so a NodeNext consumer can import it; `pnpm install` builds it via `prepare`.

### 2026-08-10T15:09:30+03:30 · FRONTEND · 0 · BLOCKED
`server/` does not depend on `@termspace/contracts`, so the shared box "both packages import from it" is half-done and I cannot finish it.
Codex: add `"@termspace/contracts": "workspace:*"` to `server/package.json` and import `Session`/`Project`/`ServerFrame` from it instead of any local shape. Nothing else is needed from you.

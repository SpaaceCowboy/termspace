# Conventions

Shared by both agents. Where this file and your own brief disagree, this wins.

## Ownership

```
server/**              Codex only
web/**                 Claude Code only
packages/contracts/**  shared — change only via docs/CONTRACTS.md
docs/PROGRESS.md       both append, neither edits
docs/PHASES.md         each ticks only its own boxes
docs/DECISIONS.md      both append
everything else        propose before touching
```

If you need a change in the other agent's directory, do not make it. Append a
`BLOCKED` entry to `docs/PROGRESS.md` naming exactly what you need, and keep
working on something else.

## Git

- Both agents work in the same checkout on the same branch. Ownership
  boundaries, not branches, are what prevent file conflicts. Do not use
  separate worktrees — each would get its own `docs/PROGRESS.md` and the
  coordination loop would silently stop working.
- Commit message: `<area>: <imperative>` where area is `server`, `web`,
  `contract`, or `docs`
- Commit small and often. The other agent reads your commits.
- `docs/PROGRESS.md` is append-only, so a conflict there is resolved by keeping
  both sides in timestamp order. Never drop an entry.
- Never rebase or force-push. Never commit a secret, a `.env`, or a database
  file.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, no `any`
- No `as` casts except at genuine IO boundaries, and then with a runtime check
- Runtime validation with `zod` at every boundary: HTTP body, WS frame, env
- Types imported from `@termspace/contracts`, never redeclared locally

## Errors

- Never swallow. Log with context or rethrow.
- Every user-facing failure carries a code from the closed union
- The frontend switches on `code`, never parses `message`

## Testing

- Anything with a state machine or a parser gets unit tests. That means the
  frame codec, the activity detector, the ticket store, and the reconnect
  backoff, at minimum.
- No test that needs a real VPS. tmux interaction is behind an interface with
  a fake.
- `pnpm test` must pass before you tick a gate box.

## Style

- No comments explaining what code does. Comments explain why, or nothing.
- Functions do one thing; if you need a section comment, extract a function.
- No new dependency without a `DECISION` entry. The list in
  `docs/PROJECT.md` is what we agreed to.

## What to do when unsure

In order: check `docs/CONTRACTS.md`, check `docs/DECISIONS.md`, check the last
30 entries of `docs/PROGRESS.md`. If still unsure, append `BLOCKED` and move to
another task. Do not guess at the seam — a wrong guess costs the other agent
more than a pause costs you.

# Conventions

Shared across the whole project. Where this file and a task brief disagree,
this wins unless the owner explicitly changes the rule.

## Ownership

Codex owns the repository. Keep server, web, and contracts concerns separated
in code, but implement cross-boundary features end to end. `docs/PROGRESS.md`
is append-only; old entries are historical evidence and are never rewritten.

## Git

- Work in the current checkout and branch unless the owner asks for another
  workflow. Product-created worktrees are runtime data, not development
  checkouts for this repository.
- Commit message: `<area>: <imperative>` where area is `server`, `web`,
  `contract`, or `docs`
- Commit complete, reviewable units. Progress and resume state travel with the
  code they describe.
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

In order: check `docs/CONTRACTS.md`, `docs/DECISIONS.md`, and the last 30
entries of `docs/PROGRESS.md`; inspect both implementations; then make the
smallest reversible assumption that preserves the documented product. Ask the
owner only when the remaining choice materially changes scope, safety, or UX.

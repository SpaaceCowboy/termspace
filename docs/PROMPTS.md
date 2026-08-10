# Prompts

Paste these into the agents. Everything else lives in the repo, which is the
point — a prompt that has to carry the whole project is a prompt you have to
retype every session.

---

## Backend — Codex, first run

```
You are the backend engineer on a two-agent team building Termspace, in this
repository. The other engineer is Claude Code on the frontend. You will never
talk to them directly — you coordinate through files in this repo.

Read these now, in order, before writing anything:
  AGENTS.md
  docs/PROJECT.md
  docs/ARCHITECTURE.md
  docs/CONTRACTS.md
  docs/CONVENTIONS.md
  docs/PHASES.md
  the last 30 entries of docs/PROGRESS.md
  docs/state/backend.md — your resume state, which you rewrite whenever you stop

You own server/** and your half of packages/contracts/**. You never edit web/**
for any reason — if you need something there, append a BLOCKED entry to
docs/PROGRESS.md naming exactly what you need, and work on something else.

We are in PHASE 0. Work only on the unticked Backend boxes for phase 0 in
docs/PHASES.md. Do not start phase 1. Do not build ahead. When your phase 0
boxes are all ticked, append a GATE entry, tick your gate box, and stop.

For every meaningful unit of work: append an entry to docs/PROGRESS.md in the
same commit as the code. If you change anything the frontend consumes, the kind
is BROKE and you state the exact old and new shape.

Start by telling me, in three lines: what you understood the system to be, what
you are picking up first, and anything in the docs that is ambiguous enough to
need a decision before you write code. Then begin.
```

---

## Frontend — Claude Code, first run

```
You are the frontend engineer on a two-agent team building Termspace, in this
repository. The other engineer is Codex on the backend. You will never talk to
them directly — you coordinate through files in this repo.

Read these now, in order, before writing anything:
  CLAUDE.md
  docs/PROJECT.md
  docs/ARCHITECTURE.md
  docs/CONTRACTS.md
  docs/CONVENTIONS.md
  docs/PHASES.md
  the last 30 entries of docs/PROGRESS.md
  docs/state/frontend.md — your resume state, which you rewrite whenever you stop

Use the team-protocol skill now and at the start of every session. Use the
contract-change skill whenever you need a shape that does not exist. Use the
terminal-client skill for anything touching xterm.js or the socket.

You own web/** and your half of packages/contracts/**. You never edit server/**
for any reason. You are never blocked on the backend: build against
packages/contracts/src/fixtures.ts behind one swappable data layer, and flip a
flag when the real endpoint lands.

We are in PHASE 0. Work only on the unticked Frontend boxes for phase 0 in
docs/PHASES.md. Do not start phase 1. Do not build ahead. When your phase 0
boxes are all ticked, append a GATE entry, tick your gate box, and stop.

Start by telling me, in three lines: what you understood the system to be, what
you are picking up first, and anything ambiguous enough to need a decision
before you write code. Then begin.
```

---

## Every session after the first — both agents

```
Sync first: run ./scripts/status.sh <backend|frontend>.

Read in this order: your resume state, then BROKE entries in the progress log,
then open contract proposals, then your unticked boxes for the current phase.

If your resume state says you were mid-task, resume from its Next concrete
step. Do not restart the task and do not rewrite work that is already there.

Tell me in one line what you are picking up and why. Then work.

Before you stop — including if you run low on context — rewrite
docs/state/<yours>.md in full.

We are in PHASE <n>. Do not touch phase <n+1>.
```

---

## Advancing a phase — you, the human

Only after both gate boxes for the phase are ticked and you have run the exit
criteria yourself.

```
Phase <n> is shipped. Update docs/PHASES.md: tick the Human box for phase <n>.
We are now in PHASE <n+1>. Read your unticked boxes for it, tell me your plan
in five lines, and wait for me to say go.
```

---

## When they have drifted

Symptoms: the same type declared twice, the frontend stubbing something the
backend already built, an agent editing the other's directory, `PROGRESS.md`
silent for a whole phase.

```
Stop feature work. Run a drift check and report only findings, no fixes:

1. Any type declared in server/ or web/ that duplicates or extends one in
   packages/contracts/
2. Any file you have edited outside your ownership boundary, per
   docs/CONVENTIONS.md
3. Any fixture in packages/contracts/src/fixtures.ts that no longer matches
   what the backend actually returns
4. Any checklist box in docs/PHASES.md ticked without a matching DONE entry in
   docs/PROGRESS.md
5. Any gap between what docs/state/<yours>.md claims and what is actually in
   the working tree

List what you find. Do not change anything yet.
```

---

## Notes on running this

Give the backend a head start on phase 0 — an hour is enough — so the contracts
package exists before the frontend needs it. After that they run genuinely in
parallel.

Read `docs/PROGRESS.md` yourself between phases. It is the only place the two
halves of the project are visible at once, and it is where drift shows up first
as entries that stop referring to each other.

When an agent asks you a question that the docs should have answered, answer it
in the doc and tell the agent to reread — not in chat. Otherwise the answer is
lost the moment that session ends.

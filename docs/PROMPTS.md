# Session prompt

Termspace is maintained by one Codex developer across the server, web client,
contracts, scripts, and documentation. The repository—not a pasted prompt—is
the durable source of truth.

For a new session:

```text
Read AGENTS.md and resume from docs/state/backend.md. Then read docs/PROJECT.md,
the last 30 entries of docs/PROGRESS.md, docs/CONTRACTS.md, and the unchecked
boxes for the current phase in docs/PHASES.md. State the next concrete step in
one line, implement it across server and web as required, test it, append a
SOLO progress entry, and rewrite docs/state/backend.md before stopping.
```

To advance a phase, the owner confirms that phase's exit criterion. Codex then
marks `Verified` and starts the next phase contract-first. A human-only gate is
never inferred from passing automated tests.

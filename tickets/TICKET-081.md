# TICKET-081 — docs/CLI.md (detailed CLI reference) + ARCHITECTURE.md extension

**Cycle 20** (Hardening, final). **Type:** docs (new + extend).

## What
1. Create `docs/CLI.md` — the detailed CLI reference.
2. Extend `docs/ARCHITECTURE.md` with a "The full composition (cycles 14-20)"
   section (keep the existing outer-spoke content).

## CLI.md contents
- Every flag with its meaning and default.
- The precedence rule (`argv` flag > `opts` > default).
- The short-circuits (`--help`/`-h`, `--version`/`-v`, `--list` intercepted before `main`).
- Exit-code semantics (driven by `result.end`, not a throw: `0` for
  `completed`/`max_steps`, `1` for `error`/`aborted`).
- Text vs `--json` output.
- The `onEvent` trajectory sink (the inner-spoke `AgentEvent` stream).
- Worked examples (a tool round-trip, a streaming turn, a step-budget turn, an
  error turn, a resume).

## ARCHITECTURE.md extension contents
- The four-algebra composition end to end: the **inner spoke** (agent loop
  `runTurn`/`runAgent`/`Conversation` + tool registry + `AgentEvent` trajectory),
  the **outer spoke** (append-only `SessionLog` + `toSessionEvent` fold), the
  **`Program`** (builds `AgentOptions`, runs a turn, owns the durable log), the
  **pure CLI** (`main`), the **launcher** (`launch` — the only place that reads
  `process.argv`, prints, returns an exit code), and the **bin shim**
  (`process.exitCode = await launch()`).
- The additive `onEvent` seam and the two-spokes-one-turn invariant.

## Acceptance
- `docs/CLI.md` exists; `docs/ARCHITECTURE.md` has the new section (old content kept).
- No code change; all 192 tests pass unchanged.

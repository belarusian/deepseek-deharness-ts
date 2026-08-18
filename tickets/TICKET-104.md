# TICKET-104: Add vitest coverage for the `Program.turns` getter

**Cycle:** 27
**Module:** `src/__tests__/program.test.ts`
**Type:** additive (new describe block, offline)

## Problem
The new `Program.turns` getter (TICKET-103) has no direct test. Rule 4: every
module has a vitest test before merge.

## Fix
Add a `Program.turns getter` describe block (or extend the existing
`Program multi-turn (in-memory)` block), all offline via an injected
`FakeLlmAdapter` + a temp `logPath` (under `os.tmpdir()`, cleaned up in
`afterEach`):

- **fresh Program reports `turns === 0`:** a newly constructed `Program`
  (before any `run`) has `program.turns === 0`.
- **`turns` increments per `run`:** after one `run`, `program.turns === 1`;
  after a second `run`, `program.turns === 2`.
- **`turns` survives `resume` and continues:** `run` (→1), `resume`, `run`
  (→2) — `program.turns === 2` after the sequence; `resume()` did not reset it
  to 0 (it set it from the seed's `turn/start` count, which is 1, so the next
  `run` is turn 2).
- **`turns` matches `result.turns`:** the getter and the most-recent
  `ProgramResult.result.turns` agree after each `run` (parity with the
  inner-spoke `Conversation.turns` contract).

Do not write a test that performs a real network turn.
